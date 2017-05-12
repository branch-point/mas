import { applyMiddleware } from 'redux';
import { persistState } from 'redux-devtools';
import thunkMiddleware from 'redux-thunk';
import { createLogger } from 'redux-logger';
import DevTools from '../components/DevTools';

export default function getEnhancers() {
  return [
    applyMiddleware(thunkMiddleware, createLogger()),
    DevTools.instrument(),
    persistState(getDebugSessionKey())
  ];
}

function getDebugSessionKey() {
  const matches = window.location.href.match(/[?&]debug_session=([^&]+)\b/);
  return (matches && matches.length > 0) ? matches[1] : null;
}
