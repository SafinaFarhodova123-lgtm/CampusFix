import type {
  AppNotification,
  PointsTx,
  Redemption,
  Reward,
  Building,
  Campus,
  Issue,
  IssueFilters,
  NewIssueInput,
  PointsSummary,
  Priority,
  Profile,
  RepairStatus,
  StatusHistoryEntry,
} from '../lib/types'

export interface DemoAccount {
  id: string
  displayName: string
  role: Profile['role']
  blurb: string
}

/** Every page talks to this interface; the driver is chosen at startup. */
export interface Api {
  mode: 'demo' | 'supabase'
  // auth
  getCurrentUser(): Promise<Profile | null>
  onAuthChange(cb: (p: Profile | null) => void): () => void
  signInWithPassword(email: string, password: string): Promise<Profile>
  /** Demo mode only: local sandbox accounts. Grants nothing on a real backend. */
  demoAccounts(): DemoAccount[]
  signInDemo(userId: string): Promise<Profile>
  signOut(): Promise<void>
  // reference data
  getCampus(): Promise<Campus>
  listBuildings(): Promise<Building[]>
  // issues
  listIssues(filters?: IssueFilters): Promise<Issue[]>
  getIssue(id: string): Promise<Issue | null>
  getHistory(issueId: string): Promise<StatusHistoryEntry[]>
  createIssue(input: NewIssueInput): Promise<Issue>
  setSupport(issueId: string, support: boolean): Promise<void>
  setFollow(issueId: string, follow: boolean): Promise<void>
  confirmResolution(issueId: string, isFixed: boolean): Promise<void>
  // staff actions — enforced server-side; the UI only hides them from non-staff
  reviewIssue(
    issueId: string,
    decision: 'verified' | 'rejected',
    opts?: { priority?: Priority; photoUseful?: boolean; note?: string },
  ): Promise<void>
  setRepairStatus(issueId: string, status: RepairStatus, note?: string): Promise<void>
  setPriority(issueId: string, priority: Priority): Promise<void>
  addNote(issueId: string, note: string): Promise<void>
  mergeIssue(issueId: string, targetId: string, note?: string): Promise<void>
  // points & rewards
  getPointsSummary(): Promise<PointsSummary>
  /** 'mine' for the signed-in user; 'all' is admin-only (enforced by RLS). */
  getPointsHistory(scope?: 'mine' | 'all'): Promise<PointsTx[]>
  listRewards(opts?: { includeInactive?: boolean }): Promise<Reward[]>
  redeemReward(rewardId: string): Promise<Redemption>
  listRedemptions(scope?: 'mine' | 'all'): Promise<Redemption[]>
  // notifications
  listNotifications(): Promise<AppNotification[]>
  // admin
  saveReward(reward: Omit<Reward, 'id'> & { id?: string }): Promise<Reward>
  setRedemptionStatus(id: string, status: 'fulfilled' | 'cancelled'): Promise<void>
  listAllBuildings(): Promise<Building[]>
  updateBuilding(id: string, patch: { floors?: string[]; active?: boolean; name?: string }): Promise<void>
  /** Reset local demo data (demo mode only). */
  resetDemo?(): Promise<void>
}

export class ApiError extends Error {}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isSupabaseConfigured = Boolean(url && key)
/** Production builds set VITE_ALLOW_DEMO=false so a missing Supabase config fails loudly instead of silently running demo mode. */
const demoAllowed = import.meta.env.VITE_ALLOW_DEMO !== 'false'

let instance: Promise<Api> | null = null

/** Lazily loads the right driver (the Supabase client is not bundled into demo startup). */
export function getApi(): Promise<Api> {
  if (!instance) {
    if (!isSupabaseConfigured && !demoAllowed) {
      return Promise.reject(new Error('This deployment is missing its Supabase settings (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'))
    }
    instance = isSupabaseConfigured
      ? import('./supabaseDriver').then((m) => m.createSupabaseApi(url!, key!))
      : import('./demoDriver').then((m) => m.createDemoApi())
  }
  return instance
}
