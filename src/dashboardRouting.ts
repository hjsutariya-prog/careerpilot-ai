export type DashboardScreen = 'apply' | 'resume' | 'tracker' | 'connections' | 'preferences' | 'source-health'

export function getDashboardStartScreen(hasResume: boolean, hasPreferences: boolean): DashboardScreen {
  return hasResume && hasPreferences ? 'apply' : 'resume'
}
