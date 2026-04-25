import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  getMembershipResolution,
  setActiveOrganization,
  type MembershipResolutionResponse,
} from '../../features/auth/auth-api';
import { signOut, useSession } from '../../features/auth/auth-client';
import {
  buildOrganizationPath,
  buildOrganizationSwitchPath,
} from '../../features/auth/auth-routing';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
};

const PLATFORM_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Projects', icon: FolderKanban, path: '/projects' },
  { label: 'Checklists', icon: ListChecks, path: '/checklists' },
  { label: 'Controls', icon: ShieldCheck, path: '/controls' },
];

const GOVERNANCE_NAV: NavItem[] = [
  { label: 'Exceptions', icon: AlertTriangle, path: '/exceptions' },
  { label: 'Audit log', icon: ScrollText, path: '/audit' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

function initialsFrom(value: string): string {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

export function DashboardSidebar() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useSidebar();
  const [resolution, setResolution] = useState<MembershipResolutionResponse | null>(null);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  const loadResolution = async () => {
    try {
      const next = await getMembershipResolution();
      setResolution(next);
    } catch {
      setResolution(null);
    }
  };

  useEffect(() => {
    void loadResolution();
  }, []);

  const organizations = resolution?.organizations ?? [];
  const activeOrg =
    organizations.find((org) => org.id === resolution?.activeOrganizationId) ?? null;

  const handleSwitchOrganization = async (organizationId: string) => {
    if (organizationId === resolution?.activeOrganizationId) return;
    setSwitchingOrgId(organizationId);
    try {
      await setActiveOrganization({ organizationId });
      const next = await getMembershipResolution();
      setResolution(next);
      const activeOrg = next.organizations.find((org) => org.id === organizationId);
      if (activeOrg) {
        navigate(
          buildOrganizationSwitchPath({
            currentOrganizationSlug:
              resolution?.organizations.find((org) => org.id === resolution.activeOrganizationId)
                ?.slug ?? null,
            currentPathname: location.pathname,
            nextOrganizationSlug: activeOrg.slug,
          }),
        );
      }
    } finally {
      setSwitchingOrgId(null);
    }
  };
  const user = session?.user;
  const userName = user?.name || user?.email || 'Account';
  const userEmail = user?.email ?? '';

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={activeOrg?.name || 'No organization'}>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {activeOrg?.name || 'No organization'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground capitalize">
                      {activeOrg?.role || 'Select an organization'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side={isMobile ? 'bottom' : 'right'}
                sideOffset={8}
                className="w-(--radix-dropdown-menu-trigger-width) min-w-64"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Organizations
                </DropdownMenuLabel>
                {organizations.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No organizations yet.
                  </div>
                ) : (
                  organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      disabled={switchingOrgId !== null}
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleSwitchOrganization(org.id);
                      }}
                    >
                      <div className="flex flex-1 flex-col">
                        <span className="truncate text-sm">{org.name}</span>
                        <span className="truncate text-xs text-muted-foreground capitalize">
                          {org.role}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/">
                    <Plus />
                    <span>Create organization</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_NAV.map((item) => {
                const to = activeOrg ? buildOrganizationPath(activeOrg.slug, item.path) : '/';

                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === to}
                      tooltip={item.label}
                    >
                      <Link to={to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Governance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {GOVERNANCE_NAV.map((item) => {
                const to = activeOrg ? buildOrganizationPath(activeOrg.slug, item.path) : '/';

                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === to}
                      tooltip={item.label}
                    >
                      <Link to={to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={userName}>
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-muted text-xs">
                      {initialsFrom(userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    {userEmail ? (
                      <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                    ) : null}
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side={isMobile ? 'bottom' : 'right'}
                className="min-w-56"
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="truncate text-sm font-medium">{userName}</span>
                    {userEmail ? (
                      <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
