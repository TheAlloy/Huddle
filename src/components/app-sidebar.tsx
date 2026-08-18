import * as React from "react"

import { NavMain, type NavItem, type NavAction } from "@/components/nav-main"
import { NavGroup } from "@/components/nav-group"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser, type NavUserInfo } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppSidebar({
  brand,
  nav,
  action,
  groups,
  secondary,
  user,
  onAccount,
  onSignOut,
  ...props
}: {
  brand: string
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!">
              <img src="/huddle-icon.png" alt="" className="size-5! rounded-md" />
              <span className="text-base font-semibold">{brand}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
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
