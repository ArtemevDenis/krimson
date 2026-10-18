import { useUnit } from 'effector-react'
import { useEffect } from 'preact/hooks'
import { Link, Route, Switch, useLocation } from 'wouter-preact'
import { currentTeamIdStore, loadTeamsFx, teamSelected, teamsLoadedStore, teamsStore } from '@/shared/model/team-model'
import { Select } from '@/shared/ui/form'
import { MatchPage } from '@/pages/match-page'
import { MatchesPage } from '@/pages/matches-page'
import { OnboardingPage } from '@/pages/onboarding-page'
import { SeasonPage } from '@/pages/season-page'
import { SetPage } from '@/pages/set-page'
import { TeamPage } from '@/pages/team-page'

function NavLink({ href, label }: { href: string; label: string }) {
  const [location] = useLocation()
  const active = href === '/' ? location === '/' || location.startsWith('/matches') || location.startsWith('/sets') : location.startsWith(href)
  return (
    <Link href={href} class={`rounded px-2.5 py-1 text-sm ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}>
      {label}
    </Link>
  )
}

export function App() {
  const [teams, teamId, loaded] = useUnit([teamsStore, currentTeamIdStore, teamsLoadedStore])

  useEffect(() => {
    void loadTeamsFx()
  }, [])

  if (!loaded) return null
  if (teams.length === 0) return <OnboardingPage />

  return (
    <div class="flex min-h-full flex-col">
      <header class="flex items-center gap-4 border-b border-zinc-800 px-4 py-2">
        <Link href="/" class="text-base font-bold tracking-tight text-rose-400">
          Krimson
        </Link>
        <nav class="flex gap-1">
          <NavLink href="/" label="Матчи" />
          <NavLink href="/team" label="Состав" />
          <NavLink href="/season" label="Статистика сезона" />
        </nav>
        <div class="ml-auto w-56">
          <Select value={teamId ?? ''} onChange={(e) => teamSelected(Number(e.currentTarget.value))}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </header>
      <main class="flex-1 px-4 py-4">
        <Switch>
          <Route path="/" component={MatchesPage} />
          <Route path="/team" component={TeamPage} />
          <Route path="/season" component={SeasonPage} />
          <Route path="/matches/:id">{(params) => <MatchPage matchId={Number(params.id)} />}</Route>
          <Route path="/sets/:id">{(params) => <SetPage setId={Number(params.id)} />}</Route>
          <Route>
            <div class="text-zinc-400">Страница не найдена</div>
          </Route>
        </Switch>
      </main>
    </div>
  )
}
