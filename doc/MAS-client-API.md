# MAS client API

Protocol version: 1

Work in progress.

# Introduction

MAS protocol is event based, server driven and built on top of
[socket.io](http://socket.io/) version 1.x.

# Login

Login endpoint expects user name and password in URL encoded form (like normal form submission).

```
POST /api/v1/login

username=john&password=123456
```

Response:

```JSON
200 OK
Set-Cookie: mas=eyAidG9rZW4iOiAiZm9vYmFyIiwgInVzZXJJZCI6IDAgfQo=; Expires=Wed, 21 Oct 2015 07:28:00 GMT
{
    "success": true,
    "msg":"set in case of failure"
}
```

`mas` cookie is base64 encoded JSON string in format:

```JSON
"{ "token": "foobar", "userId": 0 }"
```

UserId and token are needed to initiate a new client session. `token`expires when the cookie expires.

# Session

The overall approach is:

1. The client calls socket.io connect() with default URL and port.

2. Immediately after connection the client emits 'init' event.

3. Server responds either with 'initok' or 'terminate' event. If the client receives 'terminate' it needs to login again to get a new secret.

4. After 'initok' the server emits N 'ntf' (notification) events. These notification events allow the client to draw the initial UI. Event payload contains a JSON message which describes the event type and other parameters.

5. When the client initiates an action it emits an 'req' (request) event. Event payload contains a JSON message which describes the request type and other parameters.

6. After processing the request, the server sends a Socket.io acknowledgment. Acknowledgment payload contains a JSON message which describes the response type and other parameters.

7. The server sends 'ntf' events when something changes.

8. Looping continues between steps 5 and 7.

The user is allowed to have multiple concurrent active sessions (socket.io sockets) towards the server, e.g from different browser tabs or mobile devices.

# Socket.io events

## Custom MAS events

List of used custom events.

| Socket.io event name | Originator |
| -------------------- | ---------- |
| init                 | client     |
| initok               | server     |
| terminate            | server     |
| ntf                  | server     |
| req                  | client     |
| refresh_session      | server     |
| refresh_done         | client     |

## Socket.io client disconnect event

If the client receives 'disconnect' event (network hiccup or server problem) from socket.io and then 'reconnect' event, it must send 'init' event again. To make this procedure as lightweight as possible,
the client should use the cachedUpto parameter.

## Init event payload

```JSON
{
    "userId": "m453353",
    "cookie": "O1BgcLMBBEFC2etpjsRo",
    "clientName": "my_client_app",
    "clientOS": "android",
    "version": "1.0",
    "cachedUpto": 3763453
}
```

| Parameter      | Type      | Description                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| userId         | mandatory | User Id                                                                                                                                                                                                                                                                                                                                                                     |
| cookie         | mandatory | Authentication cookie                                                                                                                                                                                                                                                                                                                                                       |
| clientName     | optional  | Client name                                                                                                                                                                                                                                                                                                                                                                 |
| clientOS       | optional  | Client operating system                                                                                                                                                                                                                                                                                                                                                     |
| version        | mandatory | Must be string "1.0"                                                                                                                                                                                                                                                                                                                                                        |
| cachedUpto     | optional  | Every ADD_MESSAGE notification has a gid field which is ever increasing global id. This parameter communicates the highest the client has already seen and stored. The server will omit of sending events with lower gid in the beginning of session. Without this option, the server sends up to 200 ADD_MESSAGE notification for every window to fill the window backlog. |
| maxBacklogMsgs | optional  | Maximum amount of messages per window the client wants the server to send when a new session starts. Server might not respect this value, see 'initok' event.                                                                                                                                                                                                               |

## Initok event payload

```JSON
{
    "sessionId": "4F3rfdSW3Fd34"
}
```

| Parameter      | Type      | Description                                                                                                                                                                                                                                                                                           |
| -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sessionId      | mandatory | Session identifier. Client needs it currently only when uploading images.                                                                                                                                                                                                                             |
| maxBacklogMsgs | mandatory | Maximum amount of messages per window the server sends to the client before 'FINISH_INIT' notification. This is either the value the client sent in 'init' message if the server approved it or a default value if the client didn't send maxBacklogMsgs parameter or the value it send was rejected. |

## Terminate event payload

```JSON
{
    "code": "INVALID_SECRET",
    "reason": "Invalid or expired cookie."
}
```

| Parameter | Type      | Description                                             |
| --------- | --------- | ------------------------------------------------------- |
| code      | mandatory | Can be "INVALID_SECRET", "UNSUPPORTED_PROTOCOL_VERSION" |
| reason    | mandatory | Textual description of the failure reason.              |

## Ntf and req event payload

```JSON
{
    "id": "ADD_MESSAGE"
    ...
}
```

| Parameter | Type      | Description                       |
| --------- | --------- | --------------------------------- |
| id        | mandatory | Type of the notification, request |

Other parameters are specific to notification or request type. See below.

## Refresh session event payload

| Parameter     | Type      | Description                                                 |
| ------------- | --------- | ----------------------------------------------------------- |
| refreshCookie | mandatory | A new cookie that the client must use during the next init. |

Server sends this event after successful session init to refresh the cookie. Client must respond by emitting a `refresh_done` event (no payload).

# Example scenario

John has two active clients (A and B). Both of the clients have established active sessions (A1 and B1).

John decides to join to 'copenhagen' chat group. He clicks the join group button in client A. As a result, through the session A1, the server receives a 'req' event which contains a 'JOIN' message. Server validates the request and sends 'ADD_WINDOW' notification to all John's active sessions (A1 and B1). 'ADD_WINDOW' notification instructs the clients to create new UI window or tab for the 'copenhagen' group. After that the server sends 'JOIN' acknowledgment to session A1. Purpose of a response message is mainly to communicate failure reasons when requests can't be fulfilled.

All updates that trigger change in the UI are signaled similarly as notifications. With this approach all active clients stay synced in real time.

Another advantage is that client startup phase is not a special case. The server simply sends one 'ADD_WINDOW' notification per every group the user is participating.

# Notifications

Below is the list of notifications that MAS server can send to a client.
A notification is always a request for the client to take some action.

### ADD_MESSAGE

Add a message line to window.

```JSON
{
  "type": "ADD_MESSAGE",

  "windowId": 1,
  "body": "Hello worlds!",
  "cat": "msg",
  "ts": 2093243,
  "updatedTs": 2093315.
  "userId": "m432454",
  "status": "edited",
  "gid": 823458234
}
```

`ts` is a unix timestamp, seconds since epoch.

``updatedTs` is an optional last edit timestamp. Included if `status` is `edited` or `deleted`.

`cat` can be

| Value  | Description                                        |
| ------ | -------------------------------------------------- |
| msg    | Normal message                                     |
| info   | Info message related to the network status         |
| server | Normal message from the IRC server                 |
| banner | Banner message from the IRC server (e.g MOTD line) |
| error  | Error message from the IRC server                  |
| join   | Join indication, body is empty                     |
| part   | Part indication, body is the part message          |
| quit   | Quit indication, body is the quit reason           |
| kick   | Kick indication, body is the kick reason           |
| action | Action message                                     |

Client can for example use different colors for different categories.

`gid` is a globally unique identifier (integer) for the message. Given two messages, a newer one has always larger gid. Gid can increase by more than one between subsequent messages inside a window.

`status` is an optional property. It can be have value 'original', 'edited', or 'deleted'. A missing `status` property means 'original'.

### ADD_MESSAGES

Add several message lines to windows.

```JSON
{
  "type": "ADD_MESSAGES",

  messages: [{
    windowId: 42,
    messages: [{
      "body": "Hello worlds!",
      "cat": "msg",
      "ts": 2093243,
      "updatedTs": 2093315.
      "userId": "m432454",
      "status": "edited",
      "gid": 823458234
    }]
  }, {
    windowId: 43,
    messages: [{
      "body": "Hello again",
      "cat": "msg",
      "ts": 2093243,
      "updatedTs": 2093315.
      "userId": "m432454",
      "status": "edited",
      "gid": 923458134
    }]
  }]
}

See `ADD_MESSAGE` for description
```

### DELETE_WINDOW

Close window.

```JSON
{
  "type": "DELETE_WINDOW",

   "windowId": 1
}
```

### ADD_WINDOW

Create new window. Window identifier is either `userId` or `name`.

```JSON
{
  "type": "ADD_WINDOW",

  "windowId": 1,
  "name": "testone",
  "userId": "m43544",
  "windowType": "group",
  "network": "MAS",
  "password": "",
  "alerts": {
    "email": true,
    "notification": true,
    "sound": true,
    "title": false,
  },
  "topic": "We meet tomorrow at 3PM",
  "role": "@",
  "minimizedNamesList": false,
  "desktop": 1,
  "row": 3,
  "column": 2
}
```

`type` can be `group`, `1on1`

`network` can be `MAS`, `IRCNet`, `FreeNode` etc.

`password` an empty string if password protection is disabled, a string containing the password otherwise

`role` can be `u` (participant), `v` (voice), `@` (operator), `*` (owner)

`name` is an empty string if `type` is `1on1`

`userId` is null if `type` is `group`

If the `type` is `1on1` and the `userId` is `i0` then the window is an 1on1 with IRC network server. These are normal 1on1s except the user can only send messages starting with `/` character. Other messages are silently ignored.

### ADD_USERS

Information about the userIds. Server sends ADD_USERS command containing a userId before that userId is used in any other message.

```JSON
{
  "type": "ADD_USERS",

  "mapping": {
    "m42": {
      "name": "Mr Anderson",
      "nick": {
        "MAS": "neo",
        "IRCNet": "neo__"
      }
    },
    "m144": {
      "name": "Just Morpheus",
      "nick": {
        "MAS": "morpheus",
        "IRCNet": "joe",
        "FreeNode": "jsguru"
      }
    },
    "i300": {
      "name": "T. Rinity",
      "nick": {
        "IRCNet": "trinity"
      }
    }
  }
}
```

Server can send ADD_USERS command to update information that it sent in earlier ADD_USERS command. This happens for example when any user changes his nick. Note that the `nick` attribute is a hash, user can have different nicks in different networks.

The first ADD_USERS notification arrives immediately after 'initok' and contains an entry for the API user itself.

### UPDATE_NETWORKS

List of configured networks the user able to connect using JOIN request. The list always contains internal MAS network. Additionally it contains IRC networks that are configured in the instance configuration.

```JSON
{
  "type": "UPDATE_NETWORKS",

  "networks": [
    "MAS"
    "IRCNet",
    "FreeNode",
    "W3C"
  ]
}
```

UPDATE_NETWORKS notification arrives immediately after successful session initialization. `networks` is a full list of networks and replaces potentially existing list.

### UPDATE_FRIENDS

Full list of user's contacts (friends). Send by the server during the session startup and when a user is added or removed from a contact list.

```JSON
{
  "type": "UPDATE_FRIENDS",

  "reset": true,
  "friends": [{
      "userId": "m42321",
      "online": true
    }, {
      "userId": "m13323",
      "online": false,
      "last": 1411259620
    }
  ]
}
```

`reset` if true, then the existing list needs to be cleared. Otherwise the command adds new users or updates existing users' information on the list.

`online` can be `true`, `false`. Indicates the current situation.

`last` is included if `online` is `false`. It's a unix timestamp indicating when this user was logged in last time. Also possible is a special value `-1` which means this user hasn't ever logged in.

### ADD_ALERT

Show a generic alert info message.

```JSON
{
  "type": "ADD_ALERT",

  "alertId": 32433,
  "message": "There will be service break on Monday",
}
```

### FINISH_INIT

Initialization is complete. A hint that client can now render the UI as all initial messages (backlog) have arrived. Allows client to not update UI based on every received ADD_MESSAGE command at session startup. Can lead to more responsive UI.

```JSON
{
  "type": "FINISH_INIT"
}

```

### UPDATE_MEMBERS

Add or update users in window participant list.

```JSON
{
  "type": "UPDATE_MEMBERS",

  "windowId": 1,
  "reset": true,
  "members": [{
      "userId": "m42238",
      "role": "@"
    }, {
      "userId": "m13233",
      "role": "u"
    }, {
      "userId": "m32354",
      "role": "+"
    }
  ]
}
```

If `reset` is true, then the existing list needs to be cleared. Otherwise the command adds new users or updates existing users' roles on the list.

`role` Value is either `*` if the user is the owner, `@` if the user is an operator, `+` if the user has voice, and `u` if the user is a normal user.

### DELETE_MEMBERS

Remove one or more users from window participant list.

```JSON
{
  "type": "DELETE_MEMBERS",

  "windowId": 1,
  "members": [{
      "userId": "m42238"
    }, {
      "userId": "m35345"
    }
  ]
}
```

### UPDATE_SETTINGS

Update settings and application wide parameters

```JSON
{
  "type": "UPDATE_SETTINGS",

  "settings": {
    "activeDesktop": 1428135577,
    "emailConfirmed": false
  }
}
```

Currently only valid settings are

- `activeDesktop`, client must switch to this desktop when it receives the notification.
- `emailConfirmed`, user email becomes confirmed or unconfirmed

### UPDATE_WINDOW

Update existing parameter for existing window.

```JSON
{
  "type": "UPDATE_WINDOW",
  "windowId": 1,

  "password": "newsecret"
  "alerts": {
    "sound": true
  }
}
```

Updates a value initially received in `ADD_WINDOW` command.

Attributes in `ADD_WINDOW` command that can be update are: `password`, `topic`, `row`, `column`, `role`, ` minimizedNamesList``,  `desktop`, and `alerts```.

### CONFIRM_FRIENDS

Another user(s) wants to add the user to his/her contacts list

```JSON
{
  "type": "CONFIRM_FRIENDS",

  "friends": [{
    "userId": "m4242"
  }, {
    "userId": "m99"
  }]
}
```

Client must send one `FRIEND_VERDICT` request per received userId after the user has made the decision.

# Requests and acknowledgments

In addition of listening notifications from the server, the client can send commands to the server at any time.

Following requests are supported. Under every request is corresponding acknowledgment.

### SEND

Send a message to a group or 1on1 discussion.

Note that the session that sends SEND request doesn't receive the corresponding ADD_MESSAGE notification. Therefore the acknowledgment contains `gid` property that the other sessions and users learn from `ADD_MESSAGE` notifications (other ADD_MESSAGE notification properties the client can easily compute locally).

```JSON
{
  "id": "SEND",

  "windowId": 23,
  "text": "Hello world"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK",
  "gid": 382742993,
  "ts": 1429140481
}
```

### EDIT

```JSON
{
  "id": "EDIT",

  "windowId": 23,
  "gid": 234932,
  "text": "Hello world!"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK",
}
```

### JOIN

Join to new MAS group or IRC channel

```JSON
{
  "id": "JOIN",

  "name": "javascript",
  "network": "MAS",
  "password": ""
}
```

#### Acknowledgment

```JSON
{
  "status": "OK",
}
```

Contains `errorMsg` property if the status is not `OK`

Status can be `OK`, `NOT_FOUND`, `INCORRECT_PASSWORD`, `ALREADY_JOINED`, `PARAMETER_MISSING`

### CREATE

Create new MAS group

```JSON
{
  "id": "CREATE",

  "name": "javascript",
  "password": ""
}
```

#### Acknowledgment

```JSON
{
  "status": "OK",
}
```

Contains `errorMsg` property if the status is not `OK`

Status can be `OK`, `ERROR_NAME_MISSING`, or `ERROR_EXISTS`

### CLOSE

Close a window. In case the window is not 1on1, part from the MAS group or IRC channel.

```JSON
{
  "id": "CLOSE",

  "windowId": 3
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

### CHAT

Ask server to start a 1on1 conversation with another user. The server will follow up with a ADD_WINDOW notification if the 1on1 can be started successfully.

```JSON
{
  "id": "CHAT",

  "network": "mas",
  "userId": "m43432"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

Contains `errorMsg` property if the status is not `OK`

### LOGOUT

End session immediately

```JSON
{
  "id": "LOGOUT"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

### ACKALERT

Indicate that the user has dismissed an alert.

```JSON
{
  "id": "ACKALERT",
  "alertId": 34253
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

### SET

Update an application parameter or setting.

```JSON
{
  "id": "SET",
  "settings": {
    "activeDesktop": 48829213
  }
}
```

Currently the possible setting is `activeDesktop`.

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

### REQUEST_FRIEND

User wants to add another user to his/her contacts list.

```JSON
{
  "id": "REQUEST_FRIEND",
  "userId": "m97"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

Contains `errorMsg` property if the status is not `OK`

### FRIEND_VERDICT

This is a request that the client can send after receiving CONFIRM_FRIENDS notification and user's decision.

```JSON
{
  "id": "FRIEND_VERDICT",
  "userId": "m97",
  "allow": false
}
```

`allow` is set to true if the user accepts to be added to another user's contacts list.

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

Contains `errorMsg` property if the status is not `OK`

### REMOVE_FRIEND

```JSON
{
  "id": "REMOVE_FRIEND",

  "userId": "m4242"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

### UPDATE_PASSWORD

```JSON
{
  "id": "UPDATE_PASSWORD",

  "windowId": 1,
  "password": "pass123"
}
```

Password protection will be disabled if `password` is an empty string.

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

Contains `errorMsg` property if the status is not `OK`

### UPDATE_TOPIC

```JSON
{
  "id": "UPDATE_TOPIC",

  "windowId": 1,
  "topic": "My new topic"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

Contains `errorMsg` property if the status is not `OK`

### GET_PROFILE

```JSON
{
  "id": "GET_PROFILE",
}
```

#### Acknowledgment

```JSON
{
  "name": "Ilkka Oksanen",
  "email": "ilkkao@iki.fi",
  "nick": "ilkka"
}
```

### UPDATE_PROFILE

```JSON
{
  "id": "UPDATE_PROFILE",

  "name": "Ilkka Oksanen",
  "email": "iao@iki.fi"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

Contains `errorMsg` property if the status is not `OK`

### DESTROY_ACCOUNT

Deletes the account and log outs the user immediately.

WARNING: Can't be undone.

```JSON
{
  "id": "DESTROY_ACCOUNT"
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```

### FETCH

Fetches old messages.

```JSON
{
    "id": "FETCH",
    "windowId": 12,
    "start": 2093243,
    "limit": 500
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
  "msgs": [
     {

     }
  ]
}
```

### UPDATE

Update window settings.

```JSON
{
    "id": "UPDATE",
    "windowId": 12,
    "row": 3
}
```

#### Acknowledgment

```JSON
{
  "status": "OK"
}
```
