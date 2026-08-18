import * as React from "react"

import { NavMain, type NavItem, type NavAction } from "@/components/nav-main"
import { NavGroup } from "@/components/nav-group"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser, type NavUserInfo } from "@/components/nav-user"
import { TeamSwitcher, type Team } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

export function AppSidebar({
  teams,
  activeTeamId,
  onPickTeam,
  nav,
  action,
  groups,
  secondary,
  user,
  onAccount,
  onSignOut,
  ...props
}: {
  teams: Team[]
  activeTeamId: string
  onPickTeam: (id: string) => void
  nav: NavItem[]
  action?: NavAction
  groups?: { label: string; items: NavItem[] }[]
  secondary?: NavItem[]
  user: NavUserInfo
  onAccount: () => void
  onSignOut: () => void
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} activeId={activeTeamId} onPick={onPickTeam} />
      </SidebarHeader>
      <SidebarContent className="gap-2">
        <NavMain items={nav} action={action} />
        {(groups || []).filter(g => g.items.length > 0).map(g => (
          <NavGroup key={g.label} label={g.label} items={g.items} />
        ))}
        {secondary && secondary.length > 0 && (
          <NavSecondary items={secondary} className="mt-auto" />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onAccount={onAccount} onSignOut={onSignOut} />
      </SidebarFooter>
    </Sidebar>
  )
}
