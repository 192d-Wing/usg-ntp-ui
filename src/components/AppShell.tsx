// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * The chrome around every page: top navigation, side navigation, breadcrumbs,
 * notifications, and the help panel.
 */

import { useState, type ReactNode } from 'react';
import { Outlet, useHref, useLocation, useNavigate } from 'react-router-dom';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Flashbar from '@cloudscape-design/components/flashbar';
import HelpPanel from '@cloudscape-design/components/help-panel';
import SideNavigation, {
  type SideNavigationProps,
} from '@cloudscape-design/components/side-navigation';
import TopNavigation from '@cloudscape-design/components/top-navigation';

import { transport } from '../api/client';
import { useNotifications } from './notification-context';
import { useHelpPanel } from './help-panel-context';

/** Route path to breadcrumb label. Also drives the side navigation. */
const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/metrics': 'Metrics',
  '/clients': 'Clients',
  '/access-control': 'Access control',
  '/rate-limiting': 'Rate limiting',
  '/settings': 'Server settings',
  '/nts': 'NTS security',
  '/refclocks': 'Reference clocks',
  '/events': 'Events',
};

const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: 'link', text: 'Dashboard', href: '/' },
  {
    type: 'section',
    text: 'Monitoring',
    items: [
      { type: 'link', text: 'Metrics', href: '/metrics' },
      { type: 'link', text: 'Clients', href: '/clients' },
      { type: 'link', text: 'Events', href: '/events' },
    ],
  },
  {
    type: 'section',
    text: 'Configuration',
    items: [
      { type: 'link', text: 'Server settings', href: '/settings' },
      { type: 'link', text: 'Access control', href: '/access-control' },
      { type: 'link', text: 'Rate limiting', href: '/rate-limiting' },
    ],
  },
  {
    type: 'section',
    text: 'Time sources',
    items: [
      { type: 'link', text: 'Reference clocks', href: '/refclocks' },
      { type: 'link', text: 'NTS security', href: '/nts' },
    ],
  },
  { type: 'divider' },
  {
    type: 'link',
    text: 'ntp_usg on GitHub',
    href: 'https://github.com/192d-Wing/ntp_usg',
    external: true,
    externalIconAriaLabel: 'Opens in a new tab',
  },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { items: flashItems } = useNotifications();
  const { content: helpContent, open: helpOpen, setOpen: setHelpOpen } = useHelpPanel();
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const currentTitle = PAGE_TITLES[location.pathname] ?? 'Not found';
  const isRoot = location.pathname === '/';

  const toggleMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    applyMode(next ? Mode.Dark : Mode.Light);
  };

  // Let the router handle in-app links while leaving external links alone.
  const handleFollow = (
    event: CustomEvent<{ href?: string; external?: boolean }>,
  ): void => {
    const { href, external } = event.detail;
    if (!href || external) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };

  return (
    <>
      <div id="top-navigation">
        <TopNavigation
          identity={{
            href: useHref('/'),
            title: 'ntp_usg',
            logo: { src: '/ntp-mark.svg', alt: 'ntp_usg' },
          }}
          utilities={[
            {
              type: 'button',
              text: transport === 'mock' ? 'Demo data' : 'Live server',
              iconName: transport === 'mock' ? 'status-info' : 'status-positive',
              ariaLabel:
                transport === 'mock'
                  ? 'Showing simulated data, no server is connected'
                  : 'Connected to a live management API',
              disableUtilityCollapse: true,
            },
            {
              // No moon/sun icon exists in the Cloudscape set, and `star` reads
              // as "favorite", so this stays a text-only toggle.
              type: 'button',
              text: darkMode ? 'Light mode' : 'Dark mode',
              ariaLabel: `Switch to ${darkMode ? 'light' : 'dark'} mode`,
              onClick: toggleMode,
            },
            {
              type: 'menu-dropdown',
              text: 'Operator',
              description: 'ntp-admin',
              iconName: 'user-profile',
              items: [
                { id: 'docs', text: 'Documentation', href: '/docs', external: true },
                { id: 'signout', text: 'Sign out' },
              ],
            },
          ]}
          i18nStrings={{
            searchIconAriaLabel: 'Search',
            searchDismissIconAriaLabel: 'Close search',
            overflowMenuTriggerText: 'More',
            overflowMenuTitleText: 'All',
            overflowMenuBackIconAriaLabel: 'Back',
            overflowMenuDismissIconAriaLabel: 'Close menu',
          }}
        />
      </div>

      <AppLayout
        headerSelector="#top-navigation"
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        navigation={
          <SideNavigation
            header={{ href: '/', text: 'Time service' }}
            activeHref={location.pathname}
            items={NAV_ITEMS}
            onFollow={handleFollow}
          />
        }
        breadcrumbs={
          <BreadcrumbGroup
            items={
              isRoot
                ? [{ text: 'ntp_usg', href: '/' }]
                : [
                    { text: 'ntp_usg', href: '/' },
                    { text: currentTitle, href: location.pathname },
                  ]
            }
            onFollow={handleFollow}
            ariaLabel="Breadcrumbs"
          />
        }
        notifications={<Flashbar items={flashItems} stackItems />}
        tools={helpContent ?? <DefaultHelp />}
        toolsOpen={helpOpen}
        onToolsChange={({ detail }) => setHelpOpen(detail.open)}
        content={<Outlet />}
      />
    </>
  );
}

function DefaultHelp(): ReactNode {
  return (
    <HelpPanel header={<h2>ntp_usg console</h2>}>
      <p>
        Monitor and configure a running ntp_usg time server. Select a page in the navigation to
        see request metrics, the tracked client table, access control lists, or the state of the
        attached reference clocks.
      </p>
      <p>
        Pages with a configuration form write through to the server at runtime. The server
        applies access control, rate limiting, and interleaved mode changes without a restart.
      </p>
    </HelpPanel>
  );
}
