export type DashboardScreen = 'apply' | 'onboarding' | 'resume' | 'tracker' | 'connections' | 'preferences' | 'source-health'

export function getDashboardStartScreen(hasResume: boolean, hasPreferences: boolean): DashboardScreen {
  return hasResume && hasPreferences ? 'apply' : 'onboarding'
}
