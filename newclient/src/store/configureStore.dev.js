import { createStore, applyMiddleware, compose } from 'redux';
import { persistState } from 'redux-devtools';
import thunkMiddleware from 'redux-thunk';
import createLogger from 'redux-logger';
import rootReducer from '../reducers';
import DevTools from '../components/DevTools';

const enhancer = compose(
  applyMiddleware(thunkMiddleware, createLogger()),
  DevTools.instrument(),
  persistState(getDebugSessionKey())
);

function getDebugSessionKey() {
  const matches = window.location.href.match(/[?&]debug_session=([^&]+)\b/);
  return (matches && matches.length > 0) ? matches[1] : null;
}

export default function configureStore(initialState) {
  const store = createStore(rootReducer, initialState, enhancer);

  // if (module.hot) {
  //   module.hot.accept('../reducers', () => store.replaceReducer(require('../reducers')));
  // }

  return store;
}
