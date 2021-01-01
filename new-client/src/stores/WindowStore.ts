import { observable, computed, makeObservable } from 'mobx';
import dayjs from 'dayjs';
import Cookies from 'js-cookie';
import isMobile from 'ismobilejs';
import { dispatch } from '../lib/dispatcher';
import Message from '../models/Message';
import Window from '../models/Window';
import settingStore from './SettingStore';
import userStore from './UserStore';
import socket from '../lib/socket';

class WindowStore {
  windows = new Map();

  msgBuffer = []; // Only used during startup

  cachedUpto = 0;

  initDone = false;

  constructor() {
    makeObservable(this, {
      windows: observable,
      initDone: observable,
      desktops: computed
    });
  }

  get desktops() {
    const desktops = {};
    const desktopsArray = [];

    this.windows.forEach(window => {
      const newMessages = window.newMessagesCount;
      const desktop = window.desktop;
      const initials = window.simplifiedName.substr(0, 2).toUpperCase();

      if (desktops[desktop]) {
        desktops[desktop].messages += newMessages;
      } else {
        desktops[desktop] = { messages: newMessages, initials };
      }
    });

    Object.keys(desktops).forEach(desktop => {
      desktopsArray.push({
        id: parseInt(desktop),
        initials: desktops[desktop].initials,
        messages: desktops[desktop].messages
      });
    });

    return desktopsArray;
  }

  handleUploadFiles({ files, window }) {
    if (files.length === 0) {
      return;
    }

    const formData = new FormData();
    const uploadedFiles = Array.from(files);

    for (const file of uploadedFiles) {
      formData.append('file', file, file.name || 'webcam-upload.jpg');
    }

    formData.append('sessionId', socket.sessionId);

    // eslint-disable-next-line no-undef
    $.ajax({
      url: '/api/v1/upload',
      type: 'POST',
      data: formData,
      dataType: 'json',
      processData: false,
      contentType: false,
      success: resp =>
        dispatch('SEND_TEXT', {
          text: resp.url.join(' '),
          window
        }),
      error: () =>
        dispatch('ADD_ERROR', {
          body: 'File upload failed.',
          window
        })
    });
  }

  handleAddMessageServer({ gid, userId, ts, windowId, cat, updatedTs, status, body }) {
    const window = this.windows.get(windowId);

    if (!window) {
      return false;
    }

    if (!this.initDone) {
      // Optimization: Avoid re-renders after every message
      this.msgBuffer.push({ gid, userId, ts, windowId, cat, body, updatedTs, status, window });
    } else {
      const newMessage = this._upsertMessaage(window, {
        gid,
        userId,
        ts,
        windowId,
        cat,
        body,
        updatedTs,
        status,
        window
      });

      if (newMessage) {
        if (!window.visible && (cat === 'msg' || cat === 'action')) {
          window.newMessagesCount++;
        }

        this._trimBacklog(window.messages);
      }
    }

    return true;
  }

  handleAddMessagesServer({ messages }) {
    messages.forEach(({ windowId, messages: windowMessages }) => {
      const window = this.windows.get(windowId);
      let newMessages;

      if (window) {
        windowMessages.forEach(({ gid, userId, ts, cat, body, updatedTs, status }) => {
          const newMessage = this._upsertMessaage(window, {
            gid,
            userId,
            ts,
            windowId,
            cat,
            body,
            updatedTs,
            status,
            window
          });

          if (newMessage) {
            newMessages = true;
          }
        });

        if (newMessages) {
          this._trimBacklog(window.messages);
        }
      }
    });

    return true;
  }

  handleAddError({ window, body }) {
    // TODO: Not optimal to use error gid, there's never second error message
    window.messages.set(
      'error',
      new Message(this, {
        body,
        cat: 'error',
        userId: null,
        ts: dayjs().unix(),
        gid: 'error',
        window
      })
    );
  }

  handleSendText({ window, text }) {
    let sent = false;

    setTimeout(() => {
      if (!sent) {
        window.notDelivered = true;
      }
    }, 2500);

    socket.send(
      {
        id: 'SEND',
        text,
        windowId: window.windowId
      },
      resp => {
        sent = true;
        window.notDelivered = false;

        if (resp.status !== 'OK') {
          dispatch('OPEN_MODAL', {
            name: 'info-modal',
            model: {
              title: 'Error',
              body: resp.errorMsg
            }
          });
        } else {
          this._upsertMessaage(window, {
            body: text,
            cat: 'msg',
            userId: userStore.userId,
            ts: resp.ts,
            gid: resp.gid,
            window
          });
          this._trimBacklog(window.messages);
        }
      }
    );
  }

  handleSendCommand({ window, command, params }) {
    socket.send(
      {
        id: 'COMMAND',
        command,
        params,
        windowId: window.windowId
      },
      resp => {
        if (resp.status !== 'OK') {
          dispatch('OPEN_MODAL', {
            name: 'info-modal',
            model: {
              title: 'Error',
              body: resp.errorMsg
            }
          });
        }
      }
    );
  }

  handleCreateGroup({ name, password, acceptCb, rejectCb }) {
    socket.send(
      {
        id: 'CREATE',
        name,
        password
      },
      resp => {
        if (resp.status === 'OK') {
          acceptCb();
        } else {
          rejectCb(resp.errorMsg);
        }
      }
    );
  }

  handleJoinGroup({ name, password, acceptCb, rejectCb }) {
    socket.send(
      {
        id: 'JOIN',
        network: 'MAS',
        name,
        password
      },
      resp => {
        if (resp.status === 'OK') {
          acceptCb();
        } else {
          rejectCb(resp.errorMsg);
        }
      }
    );
  }

  handleJoinIrcChannel({ name, network, password, acceptCb, rejectCb }) {
    socket.send(
      {
        id: 'JOIN',
        name,
        network,
        password
      },
      resp => {
        if (resp.status === 'OK') {
          acceptCb();
        } else {
          rejectCb(resp.errorMsg);
        }
      }
    );
  }

  handleStartChat({ userId, network }) {
    socket.send(
      {
        id: 'CHAT',
        userId,
        network
      },
      resp => {
        if (resp.status !== 'OK') {
          dispatch('OPEN_MODAL', {
            name: 'info-modal',
            model: {
              title: 'Error',
              body: resp.errorMsg
            }
          });
        }
      }
    );
  }

  handleFetchMessageRange({ window, start, end, successCb }) {
    socket.send(
      {
        id: 'FETCH',
        windowId: window.windowId,
        start,
        end
      },
      resp => {
        window.logMessages.clear();

        resp.msgs.forEach(({ gid, userId, ts, cat, body, updatedTs, status }) => {
          window.logMessages.set(gid, new Message(this, { gid, userId, ts, cat, body, updatedTs, status, window }));
        });

        successCb();
      }
    );
  }

  handleFetchOlderMessages({ window, successCb }) {
    socket.send(
      {
        id: 'FETCH',
        windowId: window.windowId,
        end: Array.from(window.messages.values()).sort((a, b) => a.gid - b.gid)[0].ts,
        limit: 50
      },
      resp => {
        // Window messages are roughly sorted. First are old messages received by FETCH.
        // Then the messages received at startup and at runtime.
        if (!resp.msgs) {
          successCb(false);
          return;
        }

        resp.msgs.forEach(({ gid, userId, ts, cat, body, updatedTs, status }) => {
          window.messages.set(gid, new Message(this, { gid, userId, ts, cat, body, updatedTs, status, window }));
        });

        successCb(resp.msgs.length !== 0);
      }
    );
  }

  handleProcessLine({ window, body }) {
    let command = false;
    let commandParams;

    if (body.charAt(0) === '/') {
      const parts = /^(\S*)(.*)/.exec(body.substring(1));
      command = parts[1] ? parts[1].toLowerCase() : '';
      commandParams = parts[2] ? parts[2] : '';
    }

    const ircServer1on1 = window.type === '1on1' && window.userId === 'i0';

    if (ircServer1on1 && !command) {
      dispatch('ADD_ERROR', {
        body: 'Only commands allowed, e.g. /whois john',
        window
      });
      return;
    }

    if (command === 'help') {
      dispatch('OPEN_MODAL', { name: 'help-modal' });
      return;
    }

    // TODO: /me on an empty IRC channel is not shown to the sender.

    if (command) {
      dispatch('SEND_COMMAND', {
        command,
        params: commandParams.trim(),
        window
      });
      return;
    }

    dispatch('SEND_TEXT', {
      text: body,
      window
    });
  }

  handleEditMessage({ window, gid, body }) {
    socket.send(
      {
        id: 'EDIT',
        windowId: window.windowId,
        gid,
        text: body
      },
      resp => {
        if (resp.status !== 'OK') {
          dispatch('OPEN_MODAL', {
            name: 'info-modal',
            model: {
              title: 'Error',
              body: resp.errorMsg
            }
          });
        }
      }
    );
  }

  handleAddWindowServer({
    windowId,
    userId,
    network,
    windowType,
    name,
    topic,
    row,
    column,
    minimizedNamesList,
    password,
    alerts,
    desktop
  }) {
    const window = this.windows.get(windowId);
    const windowProperties = {
      windowId,
      userId,
      network,
      type: windowType,
      name,
      topic,
      row,
      column,
      minimizedNamesList,
      password,
      alerts,
      desktop,
      generation: socket.sessionId
    };

    if (window) {
      Object.assign(window, windowProperties);
    } else {
      this.windows.set(windowId, new Window(this, windowProperties));
    }
  }

  handleUpdateWindowServer({
    windowId,
    userId,
    network,
    windowType,
    name,
    topic,
    row,
    column,
    minimizedNamesList,
    desktop,
    password,
    alerts
  }) {
    const window = this.windows.get(windowId);

    Object.assign(window, {
      ...(userId ? { userId } : {}),
      ...(network ? { network } : {}),
      ...(windowType ? { type: windowType } : {}),
      ...(name ? { name } : {}),
      ...(topic ? { topic } : {}),
      ...(Number.isInteger(column) ? { column } : {}),
      ...(Number.isInteger(row) ? { row } : {}),
      ...(Number.isInteger(desktop) ? { desktop } : {}),
      ...(typeof minimizedNamesList === 'boolean' ? { minimizedNamesList } : {}),
      ...(password ? { password } : {}),
      ...(alerts ? { alerts } : {})
    });
  }

  handleCloseWindow({ window }) {
    socket.send({
      id: 'CLOSE',
      windowId: window.windowId
    });
  }

  handleDeleteWindowServer({ windowId }) {
    this.windows.delete(windowId);
  }

  handleUpdatePassword({ window, password, successCb, rejectCb }) {
    socket.send(
      {
        id: 'UPDATE_PASSWORD',
        windowId: window.windowId,
        password
      },
      resp => {
        if (resp.status === 'OK') {
          successCb();
        } else {
          rejectCb(resp.errorMsg);
        }
      }
    );
  }

  handleUpdateTopic({ window, topic }) {
    socket.send({
      id: 'UPDATE_TOPIC',
      windowId: window.windowId,
      topic
    });
  }

  handleUpdateWindowAlerts({ window, alerts }) {
    window.alerts = alerts;

    socket.send({
      id: 'UPDATE',
      windowId: window.windowId,
      alerts
    });
  }

  handleMoveWindow({ windowId, column, row, desktop }) {
    const window = this.windows.get(windowId);

    Object.assign(window, {
      ...(Number.isInteger(column) ? { column } : {}),
      ...(Number.isInteger(row) ? { row } : {}),
      ...(Number.isInteger(desktop) ? { desktop } : {})
    });

    if (!isMobile().any) {
      socket.send({
        id: 'UPDATE',
        windowId,
        desktop,
        column,
        row
      });
    }
  }

  handleToggleMemberListWidth({ window }) {
    window.minimizedNamesList = !window.minimizedNamesList;

    socket.send({
      id: 'UPDATE',
      windowId: window.windowId,
      minimizedNamesList: window.minimizedNamesList
    });
  }

  handleSeekActiveDesktop({ direction }) {
    const desktops = this.desktops;
    const activeDesktop = settingStore.settings.activeDesktop;
    let index = desktops.indexOf(desktops.find(desktop => desktop.id === activeDesktop));

    index += direction;

    if (index === desktops.length) {
      index = 0;
    } else if (index < 0) {
      index = desktops.length - 1;
    }

    dispatch('CHANGE_ACTIVE_DESKTOP', {
      desktopId: desktops[index].id
    });
  }

  handleFinishStartupServer() {
    // Remove possible deleted windows.
    this.windows.forEach(windowObject => {
      if (windowObject.generation !== socket.sessionId) {
        this.windows.delete(windowObject.windowId);
      }
    });

    // Insert buffered message in one go.
    this.msgBuffer.forEach(bufferedMessage => this._upsertMessaage(bufferedMessage.window, bufferedMessage));
    console.log(`MsgBuffer processing ended.`);

    this.msgBuffer = [];
    this.initDone = true;

    const validActiveDesktop = Array.from(this.windows.values()).some(
      window => window.desktop === settingStore.settings.activeDesktop
    );

    if (!validActiveDesktop && this.windows.size > 0) {
      settingStore.settings.activeDesktop = this.windows.values().next().value.desktop;
    }
  }

  handleAddMembersServer({ windowId, members, reset }) {
    const window = this.windows.get(windowId);

    if (reset) {
      window.operators = [];
      window.voices = [];
      window.users = [];
    }

    members.forEach(member => {
      const userId = member.userId;

      if (!reset) {
        this._removeUser(userId, window);
      }

      switch (member.role) {
        case '@':
          window.operators.push(userId);
          break;
        case '+':
          window.voices.push(userId);
          break;
        default:
          window.users.push(userId);
          break;
      }
    });
  }

  handleDeleteMembersServer({ windowId, members }) {
    const window = this.windows.get(windowId);

    members.forEach(member => {
      this._removeUser(member.userId, window);
    });
  }

  // TODO: Move these handlers somewhere else

  handleLogout({ allSessions }) {
    Cookies.remove('mas', { path: '/' });

    if (typeof Storage !== 'undefined') {
      window.localStorage.removeItem('data');
    }

    socket.send(
      {
        id: 'LOGOUT',
        allSessions: !!allSessions
      },
      () => {
        window.location = '/';
      }
    );
  }

  handleDestroyAccount() {
    socket.send(
      {
        id: 'DESTROY_ACCOUNT'
      },
      () => {
        Cookies.remove('mas', { path: '/' });
        window.location = '/';
      }
    );
  }

  _upsertMessaage(window, message) {
    const existingMessage = window.messages.get(message.gid);

    if (existingMessage) {
      Object.assign(existingMessage, message);
      return false;
    }

    window.messages.set(message.gid, new Message(this, message));
    return true;
  }

  _removeUser(userId, window) {
    window.operators = window.operators.filter(existingUserId => userId !== existingUserId);
    window.voices = window.voices.filter(existingUserId => userId !== existingUserId);
    window.users = window.users.filter(existingUserId => userId !== existingUserId);
  }

  _trimBacklog(messages) {
    const limit = 120; // TODO: Replace with virtualized scrolling
    const messageArray = Array.from(messages.values()).sort((a, b) => a.ts > b.ts);

    for (const message of messageArray) {
      if (messages.size > limit) {
        messages.delete(message.gid);
      } else {
        break;
      }
    }
  }
}

export default new WindowStore();
