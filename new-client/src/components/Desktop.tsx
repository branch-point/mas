import React, { FunctionComponent, Fragment, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Box, Flex } from '@chakra-ui/react';
import { useNavigate, useParams } from 'react-router-dom';
import { Window } from '.';
import { ServerContext } from './ServerContext';
import { parseWindowIdParam } from '../lib/urls';

interface DesktopProps {
  singleWindowMode?: boolean;
}

const Desktop: FunctionComponent<DesktopProps> = ({ singleWindowMode = false }: DesktopProps) => {
  const { windowStore } = useContext(ServerContext);
  const { windowId: windowIdUrlParam } = useParams();
  const navigate = useNavigate();
  const windows = windowStore.windowsArray;
  const activeWindow = windowStore.activeWindow;
  const visibleWindows = windows.filter(window => window.desktopId === activeWindow?.desktopId);
  const rows = [...new Set(visibleWindows.map(window => window.row))].sort();

  // windowId URL parameter is source of truth for the active window. This hook
  // detects changes in the URL and syncs the activeWindow windowStore prop.
  useEffect(() => {
    windowStore.changeActiveWindowById(parseWindowIdParam(windowIdUrlParam));
  }, [windowStore, windowIdUrlParam, navigate]);

  if (singleWindowMode) {
    return activeWindow && <Window singleWindowMode={true} window={activeWindow} />;
  }

  return (
    <Flex flex="1" minWidth="0" flexDirection="column">
      {rows.map(row => {
        return (
          <Fragment key={row}>
            {row !== 0 && <Box borderTop="1px solid #bbb" />}
            <Flex flex="1" minWidth="0" flexDirection="row">
              {visibleWindows
                .filter(window => window.row === row)
                .map(window => {
                  return (
                    <Fragment key={window.id}>
                      <Box borderLeft="1px solid #bbb" />
                      <Window window={window} />
                    </Fragment>
                  );
                })}
            </Flex>
          </Fragment>
        );
      })}
    </Flex>
  );
};

export default observer(Desktop);
