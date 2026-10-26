// SPDX-License-Identifier: GPL-3.0-or-later
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@stint/ui/tokens.css'
import './global.css'
import { App } from './App'
import { ScreenPickerApp } from './ScreenPickerApp'
import { SwitcherApp } from './SwitcherApp'

// One page serves every window; the URL hash picks which screen to show.
const hash = window.location.hash
const pickerDisplay = /^#screen-picker-(\d+)$/.exec(hash)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {pickerDisplay !== undefined ? (
      <ScreenPickerApp displayId={Number(pickerDisplay)} />
    ) : hash === '#switcher' ? (
      <SwitcherApp />
    ) : (
      <App />
    )}
  </StrictMode>,
)
