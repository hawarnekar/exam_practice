import { TopBar } from './components/TopBar'
import { AppProvider } from './store/AppContext'
import { useApp } from './store/appContextValue'
import { ProfileScreen } from './screens/ProfileScreen'
import { SetConfigScreen } from './screens/SetConfigScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function ScreenRouter() {
  const { currentScreen } = useApp()
  switch (currentScreen) {
    case 'profile_select':
      return <ProfileScreen />
    case 'set_config':
      return <SetConfigScreen />
    case 'active_set':
      return <SessionScreen />
    case 'set_summary':
      return <SummaryScreen />
    case 'dashboard':
      return <DashboardScreen />
    case 'settings':
      return <SettingsScreen />
  }
}

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <TopBar />
        <main>
          <ScreenRouter />
        </main>
      </div>
    </AppProvider>
  )
}

export default App
