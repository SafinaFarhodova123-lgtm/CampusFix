import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Api } from './api'
import { ApiError } from './api'
import { applyFilters } from '../lib/filters'
import { schematicFootprint } from './campusGeo'
import type { AppNotification, Building, Campus, Issue, PointsSummary, PointsTx, Profile, Redemption, Reward, StatusHistoryEntry } from '../lib/types'
import { historyNotification, pointsNotification } from '../lib/notifications'

/** Production driver. All authorization is enforced in the database (RLS + SECURITY DEFINER functions). */

const PHOTO_BUCKET = 'issue-photos'
const CAMPUS_SLUG = 'abington'

type Row = Record<string, any>

function fail(error: { message: string } | null, fallback = 'Something went wrong. Please try again.'): never {
  throw new ApiError(error?.message || fallback)
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })

  let campusCache: Campus | null = null
  let profileCache: Profile | null = null

  async function loadProfile(userId: string | undefined): Promise<Profile | null> {
    if (!userId) return (profileCache = null)
    const { data, error } = await sb.from('profiles').select('id, display_name, role').eq('id', userId).single()
    if (error) fail(error)
    return (profileCache = { id: data.id, displayName: data.display_name, role: data.role })
  }

  async function campus(): Promise<Campus> {
    if (campusCache) return campusCache
    const { data, error } = await sb.from('campuses').select('*').eq('slug', CAMPUS_SLUG).single()
    if (error) fail(error, 'Campus data is missing — did you run supabase/seed.sql?')
    return (campusCache = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      centerLatitude: data.center_latitude,
      centerLongitude: data.center_longitude,
    })
  }

  async function signedUrls(paths: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (!paths.length) return map
    const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60)
    for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl)
    return map
  }

  async function myRelations(ids: string[]) {
    const me = profileCache?.id
    if (!me || !ids.length) return { supported: new Set<string>(), followed: new Set<string>() }
    const [s, f] = await Promise.all([
      sb.from('issue_supporters').select('issue_id').eq('user_id', me),
      sb.from('issue_followers').select('issue_id').eq('user_id', me),
    ])
    return {
      supported: new Set((s.data ?? []).map((r: Row) => r.issue_id as string)),
      followed: new Set((f.data ?? []).map((r: Row) => r.issue_id as string)),
    }
  }

  async function mapIssues(rows: Row[]): Promise<Issue[]> {
    const [urls, rel] = await Promise.all([
      signedUrls(rows.map((r) => r.photo_path).filter(Boolean)),
      myRelations(rows.map((r) => r.id)),
    ])
    return rows.map((r) => ({
      id: r.id,
      refCode: r.ref_code,
      reporterId: r.reporter_id,
      reporterName: r.reporter_name,
      campusId: r.campus_id,
      buildingId: r.building_id,
      buildingName: r.building_name,
      floor: r.floor,
      room: r.room,
      locationNote: r.location_note,
      title: r.title,
      description: r.description,
      category: r.category,
      photoUrl: r.photo_path ? urls.get(r.photo_path) ?? null : null,
      markerLatitude: r.marker_latitude,
      markerLongitude: r.marker_longitude,
      verificationStatus: r.verification_status,
      repairStatus: r.repair_status,
      priority: r.priority,
      duplicateOfIssueId: r.duplicate_of_issue_id,
      isSample: r.is_sample,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      resolvedAt: r.resolved_at,
      supporterCount: r.supporter_count ?? 0,
      supportedByMe: rel.supported.has(r.id),
      followedByMe: rel.followed.has(r.id),
    }))
  }

  async function buildings(includeInactive: boolean): Promise<Building[]> {
    const c = await campus()
    let q = sb.from('buildings').select('*').eq('campus_id', c.id).order('name')
    if (!includeInactive) q = q.eq('active', true)
    const { data, error } = await q
    if (error) fail(error)
    return (data ?? []).map((b: Row) => ({
      id: b.id,
      campusId: b.campus_id,
      slug: b.slug,
      name: b.name,
      shortName: b.short_name ?? b.name,
      latitude: b.latitude,
      longitude: b.longitude,
      geoSource: b.footprint_geojson ? b.geo_source : 'schematic',
      floors: b.floors ?? [],
      // Real footprints from the DB win; otherwise fall back to the labeled simplified layout.
      footprint: b.footprint_geojson ?? schematicFootprint(b.slug),
      heightM: Number(b.height_m ?? 10),
      active: b.active,
    }))
  }

  const mapTx = (t: Row): PointsTx => ({
    id: t.id,
    userId: t.user_id,
    userName: t.profile?.display_name ?? null,
    issueId: t.issue_id,
    issueTitle: t.issue?.title ?? null,
    issueRef: t.issue ? `CF-${t.issue.ref_number}` : null,
    action: t.action_type,
    points: t.points,
    status: t.status,
    createdAt: t.settled_at ?? t.created_at,
  })
  const mapRedemption = (r: Row): Redemption => ({
    id: r.id,
    userId: r.user_id,
    userName: r.profile?.display_name ?? null,
    rewardId: r.reward_id,
    rewardTitle: r.reward?.title ?? 'Reward',
    imageKey: r.reward?.image_key ?? 'gift',
    pointsSpent: r.points_spent,
    status: r.status,
    createdAt: r.created_at,
  })
  const mapReward = (r: Row): Reward => ({
    id: r.id,
    title: r.title,
    description: r.description,
    pointsRequired: r.points_required,
    imageKey: r.image_key ?? 'gift',
    active: r.active,
  })

  async function getIssue(id: string): Promise<Issue | null> {
    const { data, error } = await sb.from('issue_feed').select('*').eq('id', id).maybeSingle()
    if (error) fail(error)
    if (!data) return null
    return (await mapIssues([data]))[0]
  }

  const requireUser = () => {
    if (!profileCache) throw new ApiError('Please sign in first.')
    return profileCache
  }

  return {
    mode: 'supabase',

    async getCurrentUser() {
      const { data } = await sb.auth.getSession()
      return loadProfile(data.session?.user.id)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        // defer DB call out of the auth callback (recommended by supabase-js)
        setTimeout(() => {
          loadProfile(session?.user.id).then(cb, () => cb(null))
        }, 0)
      })
      return () => data.subscription.unsubscribe()
    },
    async signInWithPassword(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) fail(error)
      return (await loadProfile(data.user?.id))!
    },
    demoAccounts() {
      return []
    },
    async signInDemo() {
      throw new ApiError('Demo accounts are only available in local demo mode.')
    },
    async signOut() {
      await sb.auth.signOut()
      profileCache = null
    },

    getCampus: campus,
    async listBuildings(): Promise<Building[]> {
      return (await buildings(false)).filter((b) => b.active)
    },
    async listAllBuildings() {
      return buildings(true)
    },
    async updateBuilding(id, patch) {
      const { error } = await sb.from('buildings').update(patch).eq('id', id) // RLS: admins only
      if (error) fail(error)
    },

    async listIssues(filters) {
      const c = await campus()
      const { data, error } = await sb
        .from('issue_feed')
        .select('*')
        .eq('campus_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) fail(error)
      return applyFilters(await mapIssues(data ?? []), filters)
    },
    getIssue,
    async getHistory(issueId): Promise<StatusHistoryEntry[]> {
      const { data, error } = await sb
        .from('issue_status_history')
        .select('id, issue_id, kind, previous_status, new_status, note, created_at, changer:profiles(display_name)')
        .eq('issue_id', issueId)
        .order('created_at')
      if (error) fail(error)
      return (data ?? []).map((h: Row) => ({
        id: h.id,
        issueId: h.issue_id,
        kind: h.kind,
        previousStatus: h.previous_status,
        newStatus: h.new_status,
        note: h.note,
        createdAt: h.created_at,
        changedByName: h.changer?.display_name ?? null,
      }))
    },

    async createIssue(input) {
      const me = requireUser()
      const c = await campus()
      let photoPath: string | null = null
      if (input.photo) {
        photoPath = `${me.id}/${crypto.randomUUID()}.jpg`
        const { error } = await sb.storage
          .from(PHOTO_BUCKET)
          .upload(photoPath, input.photo, { contentType: 'image/jpeg', upsert: false })
        if (error) fail(error, 'Photo upload failed.')
      }
      const { data, error } = await sb
        .from('issues')
        .insert({
          reporter_id: me.id,
          campus_id: c.id,
          building_id: input.buildingId,
          floor: input.floor || null,
          room: input.room.trim() || null,
          location_note: input.locationNote.trim() || null,
          title: input.title.trim(),
          description: input.description.trim(),
          category: input.category,
          photo_path: photoPath,
          marker_latitude: input.markerLatitude ?? null,
          marker_longitude: input.markerLongitude ?? null,
        })
        .select('id')
        .single()
      if (error) {
        if (photoPath) await sb.storage.from(PHOTO_BUCKET).remove([photoPath]).catch(() => undefined)
        fail(error)
      }
      const created = await getIssue(data.id)
      if (!created) throw new ApiError('Report saved, but could not be loaded.')
      return created
    },

    async setSupport(issueId, support) {
      const me = requireUser()
      const { error } = support
        ? await sb.from('issue_supporters').upsert({ issue_id: issueId, user_id: me.id }, { onConflict: 'issue_id,user_id', ignoreDuplicates: true })
        : await sb.from('issue_supporters').delete().eq('issue_id', issueId).eq('user_id', me.id)
      if (error) fail(error, 'You can’t support your own report.')
      if (support) await sb.from('issue_followers').upsert({ issue_id: issueId, user_id: me.id }, { ignoreDuplicates: true })
    },
    async setFollow(issueId, follow) {
      const me = requireUser()
      const { error } = follow
        ? await sb.from('issue_followers').upsert({ issue_id: issueId, user_id: me.id }, { ignoreDuplicates: true })
        : await sb.from('issue_followers').delete().eq('issue_id', issueId).eq('user_id', me.id)
      if (error) fail(error)
    },
    async confirmResolution(issueId, isFixed) {
      const { error } = await sb.rpc('confirm_resolution', { p_issue_id: issueId, p_is_fixed: isFixed })
      if (error) fail(error)
    },

    async getPointsSummary(): Promise<PointsSummary> {
      if (!profileCache) return { available: 0, pending: 0, lifetimeEarned: 0, redeemed: 0 }
      const { data, error } = await sb.from('my_points_summary').select('*').eq('user_id', profileCache.id).maybeSingle()
      if (error) fail(error)
      return {
        available: data?.available ?? 0,
        pending: data?.pending ?? 0,
        lifetimeEarned: data?.lifetime_earned ?? 0,
        redeemed: data?.redeemed ?? 0,
      }
    },

    async getPointsHistory(scope = 'mine') {
      let q = sb
        .from('points_transactions')
        .select('*, issue:issues(title, ref_number), profile:profiles(display_name)')
        .order('created_at', { ascending: false })
        .limit(500)
      if (scope === 'mine') q = q.eq('user_id', requireUser().id)
      const { data, error } = await q
      if (error) fail(error)
      return (data ?? []).map(mapTx)
    },
    async listRewards(opts = {}) {
      let q = sb.from('rewards').select('*').order('points_required')
      if (!opts.includeInactive) q = q.eq('active', true)
      const { data, error } = await q
      if (error) fail(error)
      return (data ?? []).map(mapReward)
    },
    async redeemReward(rewardId) {
      const { data, error } = await sb.rpc('redeem_reward', { p_reward_id: rewardId })
      if (error) fail(error)
      const { data: row, error: e2 } = await sb.from('redemptions').select('*, reward:rewards(title, image_key)').eq('id', data.id).single()
      if (e2) fail(e2)
      return mapRedemption(row)
    },
    async listRedemptions(scope = 'mine') {
      let q = sb.from('redemptions').select('*, reward:rewards(title, image_key), profile:profiles(display_name)').order('created_at', { ascending: false })
      if (scope === 'mine') q = q.eq('user_id', requireUser().id)
      const { data, error } = await q
      if (error) fail(error)
      return (data ?? []).map(mapRedemption)
    },
    async listNotifications() {
      if (!profileCache) return []
      const [h, p] = await Promise.all([
        sb.from('my_notifications').select('*').order('created_at', { ascending: false }).limit(40),
        sb.from('points_transactions').select('*, issue:issues(title, ref_number)').eq('user_id', profileCache.id).eq('status', 'available').order('created_at', { ascending: false }).limit(40),
      ])
      if (h.error) fail(h.error)
      if (p.error) fail(p.error)
      const fromHistory = (h.data ?? []).map((r: Row) =>
        historyNotification({ id: r.id, issueId: r.issue_id, issueRef: r.ref_code, issueTitle: r.issue_title, kind: r.kind, newStatus: r.new_status, note: r.note, createdAt: r.created_at }),
      )
      const fromPoints = (p.data ?? []).map((t: Row) => pointsNotification(mapTx(t)))
      return [...fromHistory, ...fromPoints].filter((n): n is AppNotification => !!n)
    },
    async saveReward(input) {
      const row = { title: input.title, description: input.description, points_required: input.pointsRequired, image_key: input.imageKey, active: input.active }
      const { data, error } = input.id
        ? await sb.from('rewards').update(row).eq('id', input.id).select().single()
        : await sb.from('rewards').insert(row).select().single()
      if (error) fail(error)
      return mapReward(data)
    },
    async setRedemptionStatus(id, status) {
      const { error } = await sb.rpc('set_redemption_status', { p_redemption_id: id, p_status: status })
      if (error) fail(error)
    },

    // ---- staff (each RPC re-checks the caller's role in the database)
    async reviewIssue(issueId, decision, opts = {}) {
      const { error } = await sb.rpc('verify_issue', {
        p_issue_id: issueId,
        p_decision: decision,
        p_priority: opts.priority ?? null,
        p_photo_useful: opts.photoUseful ?? true,
        p_note: opts.note?.trim() || null,
      })
      if (error) fail(error)
    },
    async setRepairStatus(issueId, status, note) {
      const { error } = await sb.rpc('set_repair_status', { p_issue_id: issueId, p_status: status, p_note: note?.trim() || null })
      if (error) fail(error)
    },
    async setPriority(issueId, priority) {
      const { error } = await sb.rpc('set_issue_priority', { p_issue_id: issueId, p_priority: priority })
      if (error) fail(error)
    },
    async addNote(issueId, note) {
      const { error } = await sb.rpc('add_issue_note', { p_issue_id: issueId, p_note: note })
      if (error) fail(error)
    },
    async mergeIssue(issueId, targetId, note) {
      const { error } = await sb.rpc('merge_issue', { p_issue_id: issueId, p_target_id: targetId, p_note: note?.trim() || null })
      if (error) fail(error)
    },
  }
}
