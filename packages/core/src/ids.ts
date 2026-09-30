// SPDX-License-Identifier: GPL-3.0-or-later
import { v7 as uuidv7 } from 'uuid'

/** New record ID. UUIDv7 embeds a timestamp, so IDs sort by creation time. */
export function newId(): string {
  return uuidv7()
}
