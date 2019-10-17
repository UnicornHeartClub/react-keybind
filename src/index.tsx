/**
 * Shortcut Enhancer
 *
 * Provides a default HOC and Context
 *
 * @format
 */

import * as React from 'react'

/**
 * Shortcut
 */
export interface IShortcut {
  description: string
  hold: boolean
  holdDuration: number
  id: string
  keys: string[]
  method: (props: any) => any
  sequence: boolean
  title: string
}

/**
 * Shortcut binding
 */
export interface IShortcutBinding {
  [key: string]: IShortcut
}

/**
 * Shortcut Props
 */
export interface IShortcutProviderProps {
  children?: React.ReactNode
  ignoreTagNames?: string[]
}

/**
 * Shortcut State
 */
export interface IShortcutProviderState {
  shortcuts: IShortcut[]
}

/**
 * Shortcut Render Props
 */
export interface IShortcutProviderRenderProps extends IShortcutProviderState {
  registerShortcut?: (
    method: (e?: React.KeyboardEvent<any> | KeyboardEvent) => any,
    keys: string[],
    title: string,
    description: string,
    holdDuration?: number,
  ) => void
  registerSequenceShortcut?: (
    method: () => any,
    keys: string[],
    title: string,
    description: string,
  ) => void
  unregisterShortcut?: (keys: string[]) => void
}

/**
 * Listener Interface
 */
interface ISingleShortcutListener {
  [key: string]: (e: React.KeyboardEvent<any> | KeyboardEvent) => any
}

/**
 * MultiListener Interface
 * Uses an array to store multiple different shortcuts. Only applies to standard shortcuts
 */
interface IShortcutListener {
  [key: string]: ((e: React.KeyboardEvent<any> | KeyboardEvent) => any)[]
}

/**
 * With Shortcut Interface
 */
export interface IWithShortcut {
  shortcut?: IShortcutProviderRenderProps
}

/**
 * Default tags to ignore shortcuts when focused
 */
const ignoreForTagNames = ['input']

/**
 * Shortcut Context to provide and consume global shortcuts
 */
const defaultState: IShortcutProviderRenderProps = {
  shortcuts: [],
}
const ShortcutContext = React.createContext(defaultState)
export const ShortcutConsumer = ShortcutContext.Consumer

/**
 * Default withShortcut HOC
 *
 * Wraps any child component with the ShortcutConsumer to pass on enhancer functionality
 */
export const withShortcut = <T extends IWithShortcut>(Child: React.ComponentType<T>) =>
  class WithShortcut extends React.Component<T & IWithShortcut> {
    render() {
      return (
        <ShortcutConsumer>
          {shortcutProps => <Child {...this.props} shortcut={shortcutProps} />}
        </ShortcutConsumer>
      )
    }
  }

// Shortcut Provider
export class ShortcutProvider extends React.PureComponent<IShortcutProviderProps> {
  holdDurations: {
    [key: string]: number
  } = {}
  holdInterval?: number
  holdListeners: ISingleShortcutListener = {}
  holdTimer: number = 0
  keysDown: string[] = []
  listeners: IShortcutListener = {}
  previousKeys: string[] = []
  sequenceListeners: ISingleShortcutListener = {}
  sequenceTimer?: number
  shortcuts: IShortcut[] = []

  readonly state: IShortcutProviderState = {
    shortcuts: [],
  }

  /**
   * Route known keys to their proper exectued counterpart
   *
   * Mappings:
   *  - opt, option = alt
   *  - control = ctrl
   *  - cmd, command = meta
   */
  static transformKeys = (keys: string[]) => {
    return keys.map(rawKeys => {
      const splitKeys = rawKeys.split('+')
      const transformedKeys = splitKeys.map(key => {
        const keyEvent = key.toLowerCase()
        switch (keyEvent) {
          case 'opt':
          case 'option':
            return 'alt'
          case 'control':
            return 'ctrl'
          case 'cmd':
          case 'command':
            return 'meta'
          default:
            return keyEvent
        }
      })
      return transformedKeys.join('+')
    })
  }

  /**
   * Mount the single event listener
   */
  componentDidMount() {
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
  }

  /**
   * Create an interval timer to check the duration of held keypresses
   */
  private createTimer = (callback: () => void) => {
    this.holdInterval = window.setInterval(() => {
      callback()
      this.holdTimer += 100
    }, 100)
  }

  /**
   * Handle "keydown" events and run the appropriate registered method
   */
  keyDown = (e: KeyboardEvent) => {
    const { ignoreTagNames } = this.props
    const target = e.target as HTMLElement
    // ignore listening when certain elements are focused
    const ignore = ignoreTagNames
      ? [...ignoreTagNames.map(tag => tag.toLowerCase()), ...ignoreForTagNames]
      : ignoreForTagNames
    // The currently pressed key
    const key = e.key.toLowerCase()

    // ensure that we're not focused on an element such as an <input />
    if (ignore.indexOf(target.tagName.toLowerCase()) < 0 && this.keysDown.indexOf(key) < 0) {
      const keysDown: string[] = []
      if (e.ctrlKey === true) {
        keysDown.push('ctrl')
      }
      if (e.altKey === true) {
        keysDown.push('alt')
      }
      if (e.metaKey === true) {
        keysDown.push('meta')
      }
      if(e.shiftKey === true) {
        keysDown.push('shift')
      }

      keysDown.push(key)
      const keyPress = keysDown.join('+')
      if (this.listeners[keyPress]) {
        // automatically preventDefault on the key
        e.preventDefault()
        this.listeners[keyPress].forEach(method => method(e))
      }

      this.keysDown = [...this.keysDown, ...keysDown]

      // create an interval to check the duration every 100ms
      this.resetTimer()
      this.createTimer(() => {
        keysDown.forEach(key => {
          if (this.holdTimer >= this.holdDurations[key]) {
            // we're paseed the duration - execute and reset the timer check
            this.holdListeners[keyPress](e)
            this.resetTimer()
          }
        })
      })

      // check if we fulfilled a sequence
      if (this.sequenceTimer !== undefined) {
        window.clearTimeout(this.sequenceTimer)
      }

      // Track previously pressed keys
      this.previousKeys.push(...keysDown)

      const sequenceKeys = this.previousKeys.join(',')
      if (this.sequenceListeners[sequenceKeys] !== undefined) {
        this.sequenceListeners[sequenceKeys](e)
        if (this.sequenceTimer) {
          window.clearTimeout(this.sequenceTimer)
          this.sequenceTimer = undefined
          this.previousKeys = []
        }
      }

      // we have 2s to keep sequencing keys otherwise we'll reset the previous array
      this.sequenceTimer = window.setTimeout(() => {
        this.previousKeys = []
        this.sequenceTimer = undefined
      }, 2000)
    }
  }

  /**
   * Unset the previously pressed keys
   */
  keyUp = (e: KeyboardEvent) => {
    const keysUp: string[] = []
    if (e.ctrlKey === true) {
      keysUp.push('ctrl')
    }
    if (e.altKey === true) {
      keysUp.push('alt')
    }
    if (e.metaKey === true) {
      keysUp.push('meta')
    }
    if(e.shiftKey === true) {
      keysUp.push('shift')
    }

    keysUp.push(e.key.toLowerCase())
    this.keysDown = this.keysDown.filter(key => keysUp.indexOf(key) < 0)

    this.resetTimer()
  }

  /**
   * Register a new shortcut for the application
   *
   * Set a holdDuration to execute the shortcut only after the set keys have been pressed for the
   * configured duration.
   */
  registerShortcut = (
    method: (e: React.KeyboardEvent<any> | KeyboardEvent) => any,
    keys: string[] = [],
    title: string,
    description: string,
    holdDuration?: number,
  ) => {
    const nextShortcuts = [...this.shortcuts]

    // do we need to hold this shortcut?
    const hold = holdDuration !== undefined
    const duration = holdDuration !== undefined ? holdDuration : 0
    const transformedKeys = ShortcutProvider.transformKeys(keys)

    // create new shortcut
    const shortcut: IShortcut = {
      id: Date.now().toString(36),
      description,
      hold,
      holdDuration: duration,
      keys: transformedKeys,
      method,
      sequence: false,
      title,
    }
    // add it to the list of shortcuts
    nextShortcuts.push(shortcut)

    // create a listener for each key
    transformedKeys.forEach(key => {
      if (hold) {
        this.holdDurations[key] = duration
        this.holdListeners[key] = method
      } else {
        if (!this.listeners[key]) {
          this.listeners[key] = []
        }

        this.listeners[key] = [...this.listeners[key], method]
      }
    })

    this.shortcuts = nextShortcuts

    this.setState({
      shortcuts: nextShortcuts,
    })
  }

  /**
   * Register a shortcut that listens for a sequence of keys to be pressed
   *
   * Unlike the registerShortcut method, the array of keys represents the keys that need to be
   * pressed in the configured order
   */
  registerSequenceShortcut = (
    method: () => any,
    keys: string[] = [],
    title: string,
    description: string,
  ) => {
    const nextShortcuts = [...this.shortcuts]

    // create new shortcut
    const shortcut: IShortcut = {
      id: Date.now().toString(36),
      description,
      hold: false,
      holdDuration: 0,
      keys,
      method,
      sequence: true,
      title,
    }

    // check if we already have existing keys for the new keys being passed
    let exists = false
    const keyEvent = keys.join(',').toLowerCase()
    Object.keys(this.sequenceListeners).forEach(existingKey => {
      exists = exists || keyEvent === existingKey
    })

    if (!exists) {
      nextShortcuts.push(shortcut)

      // create a listener for each key
      this.sequenceListeners[keyEvent] = method

      this.shortcuts = nextShortcuts

      this.setState({
        shortcuts: nextShortcuts,
      })
    }
  }

  /**
   * Reset the keypress timer
   */
  private resetTimer = () => {
    if (this.holdInterval !== undefined) {
      window.clearInterval(this.holdInterval)
      this.holdInterval = undefined
      this.holdTimer = 0
    }
  }

  /**
   * Remove a shortcut from the application
   */
  unregisterShortcut = (keys: string[], sequence: boolean = false) => {
    const transformedKeys = ShortcutProvider.transformKeys(keys)
    if (!sequence) {
      transformedKeys.forEach(key => {
        delete this.listeners[key]
        delete this.holdListeners[key]
        delete this.holdDurations[key]
      })
    } else {
      const keyEvent = transformedKeys.join(',')
      delete this.sequenceListeners[keyEvent]
    }

    // Delete the shortcut
    const nextShortcuts = this.shortcuts.filter(({ keys: shortcutKeys }) => {
      let match = true
      shortcutKeys.forEach(shortcutKey => {
        match = match && transformedKeys.indexOf(shortcutKey) >= 0
      })
      return !match
    })

    this.shortcuts = nextShortcuts

    this.setState({
      shortcuts: nextShortcuts,
    })
  }

  /**
   * Render
   */
  render() {
    const { shortcuts } = this.state
    const { children } = this.props
    const providerProps: IShortcutProviderRenderProps = {
      registerShortcut: this.registerShortcut,
      registerSequenceShortcut: this.registerSequenceShortcut,
      shortcuts,
      unregisterShortcut: this.unregisterShortcut,
    }

    return <ShortcutContext.Provider value={providerProps}>{children}</ShortcutContext.Provider>
  }
}
