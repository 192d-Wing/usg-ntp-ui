// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

import Box from '@cloudscape-design/components/box';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';

import { RouteLink } from '../components/primitives';

export function NotFound() {
  return (
    <ContentLayout header={<Header variant="h1">Page not found</Header>}>
      <Box padding={{ top: 'l' }}>
        <SpaceBetween size="m">
          <Box variant="p">
            There is no page at this address. It may have been renamed, or the link may be
            mistyped.
          </Box>
          <RouteLink to="/">Go to the dashboard</RouteLink>
        </SpaceBetween>
      </Box>
    </ContentLayout>
  );
}
