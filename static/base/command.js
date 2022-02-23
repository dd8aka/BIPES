"use strict";

import {Tool} from './tool.js'

/**
 * Send commands across tabs and windows by listening to localStorage events.
 * Each command has a key, a rule, function and callback associated.
 */
class CommandBroker {
   /**
   * Create the LocalCommand object with a root object. The root object should
   * be tightly structured and easily navigable to properley dispatch commands.
   * @param {Object} root - Root object, where all callbacks are child from.
   */
  constructor () {
    this.name = 'command'
    this.map = {}
    this.pipe = new BroadcastChannel('main')
    this.pipe.onmessage = (ev) => {
      this.mux(ev)
    }
    this.tabUID = Tool.UID()
    this.clients = []

    this.add (this, {
      clientsChanged: this.clientsChanged
    }, true)

    this._clientConnect ()
    window.addEventListener("unload", () => {
      this._clientDisconnect()
      this.pipe.close()
    })
  }
  /**
   * Add a LocalCommand, which callback when the event is dispatched.
   * The callback of each item is associated to it's key.
   * The callback should not change the localStorage,
   * only handle local variables and DOM Nodes.
   * @param {Object} self - Object that the callbacks belong to.
   * @param {Object} callbacks - Object composed of callback functions
   * @param {Boolenan} skipMain - Set "true" to skip the callback on main tab
   */
  add (self, callbacks, skipMain){
    let _header = ''
    if (self instanceof Array){
      self.forEach(s => {_header += `_${s.name}`})
      _header = _header.substr(1)
    } else
      _header = self.name
    for (let key in callbacks){
      let _key =`${_header}_${key}`
      this.map[_key] = {}
      this.map[_key].fun = (key, args) => {

        let self = bipes.page
        if (args[0] == 'channel') {
          self = bipes.channel
        } else if (args[0] == 'command') {
          self = bipes.command
        } else {
          args[0].forEach((item) => {
            self = self[item]
          })
        }
        args.shift()
        this.map[_key].callback.apply(self, args)
        localStorage.removeItem(key)
      }
      this.map[_key].callback = callbacks[key]
      this.map[_key].skipMain = skipMain == true ? true : false
    }
  }
   /**
   * Remove a LocalCommand.
   * @param {Object} self - Object that the callbacks belong to.
   * @param {(string|string[])} keys - Key or keys to remove.
   */
  remove (self, keys){
    if (keys.constructor.name != 'Array')
      keys = [keys]
    keys.forEach((key) => {
      let _key = `${self.name}_${key}`
      window.removeEventListener ("storage", this.map[_key].fun)
      delete this.map[_key]
    })
  }
  /**
   * Dispatch a LocalCommand.
   * @param {Object} self - Object with the callback, if a subobject, include
   * its parents until it.
   * @param {key} - Key of the command.
   * @param {Object[]} - Arguments to apply to the callback.
   */
  dispatch (self, key, args){
    if (!(self instanceof Array))
      self = [self]

    let _key = '',
        _self = []

    self.forEach(s => {_key += `_${s.name}`})
    _key = _key.substr(1)
    _key += `_${key}`

    if (!this.map.hasOwnProperty(_key)) {
      console.error(`CommandBroker: ${_key} does not exist in the command map.`)
      return
    }

    // Call function on main window
    if (this.map[_key].skipMain == false)
      this.map[_key].callback.apply(self[self.length-1], args)

    // Include this parent to child key
    self.forEach((item) => {
      _self.push(item.constructor.name == 'String' ?
                 item : item.name.toLowerCase())
    })
    args.unshift(_self)

    // Preserve structure of some objects
    args = args.map(arg => {
      if (arg == undefined)
        return
      switch (arg.constructor.name) {
        case 'Uint8Array':
          return {Uint8Array:Array.from(arg)}
          break
        default:
          return arg
      }
    })

    // Dispatch command
    this.pipe.postMessage(`["${Tool.SID()}_${_key}",${JSON.stringify(args)}]`)
  }
  mux (ev){
    let data = JSON.parse(ev.data)
    let _key = data[0],
        args = data[1]

    // Restore structure of some objects
    args = args.map(arg => {
      if (typeof arg === 'object' && arg !== null){
        if (Object.keys(arg)[0] === 'Uint8Array'){
          return new Uint8Array(arg.Uint8Array)
        }
      }
      return arg
    })

    const key = _key.substring(7)
    if (!this.map.hasOwnProperty(key))
      return

    this.map[key].fun(_key, args)
  }
  _clientConnect (){
    // Parse connected clients and include tab
    if (localStorage['clients'] == undefined || localStorage['clients'] == '[]') {
      this.clients = [this.tabUID]
      localStorage.setItem('clients', JSON.stringify(this.clients))
    } else {
      this.clients = JSON.parse(localStorage['clients'])
      this.clients.push(this.tabUID)
      localStorage.setItem('clients', JSON.stringify(this.clients))

      if (this.clients.length > 1)
        this.dispatch(this, 'clientsChanged', [this.tabUID, true])
    }
  }
  _clientDisconnect (){
    this.clients.splice(
      this.clients.indexOf(this.tabUID), 1
    )
    localStorage.setItem('clients', JSON.stringify(this.clients))

    this.dispatch(this, 'clientsChanged', [this.tabUID, false])
  }
  /**
   * If clients were removed or added.
   * @param {string} uid - Uid of the tab.
   * @param {bool} add - True to add and false to remove.
   */
  clientsChanged (uid, add){
    if (add) {
      this.clients.push(uid)
    } else {
      this.clients.splice(
        this.clients.indexOf(uid), 1
      )
    }
  }
}


export let command = new CommandBroker()