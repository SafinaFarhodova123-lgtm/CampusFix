import type { Issue } from './types'

export interface Achievement {
  id: 'first-fix' | 'campus-guardian' | 'community-helper'
  name: string
  description: string
  progress: number
  goal: number
  earned: boolean
}

/** Derived purely from records (no stored state), so it can't drift from the data. */
export function computeAchievements(userId: string, issues: Issue[]): Achievement[] {
  const verifiedReports = issues.filter((i) => i.reporterId === userId && i.verificationStatus === 'verified').length
  const supported = issues.filter((i) => i.supportedByMe).length
  const make = (id: Achievement['id'], name: string, description: string, progress: number, goal: number): Achievement => ({
    id,
    name,
    description,
    progress: Math.min(progress, goal),
    goal,
    earned: progress >= goal,
  })
  return [
    make('first-fix', 'First Fix', 'Have your first report verified by facilities.', verifiedReports, 1),
    make('campus-guardian', 'Campus Guardian', 'Have 5 of your reports verified.', verifiedReports, 5),
    make('community-helper', 'Community Helper', 'Support 5 reports from other people.', supported, 5),
  ]
}
