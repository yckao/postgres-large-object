import * as stream from 'stream'
import { LargeObject } from './LargeObject'

export class ReadStream extends stream.Readable {
  private _largeObject: LargeObject
  constructor(largeObject: LargeObject, bufferSize: number) {
    super({
      highWaterMark: bufferSize || 16384,
      objectMode: false,
    })
    this._largeObject = largeObject
  }

  public _read = (length: number): void => {
    if (length <= 0) {
      throw 'Illegal Argument'
    }

    this._largeObject.read(length, (error?: Error, data?: Buffer) => {
      if (error) {
        this.emit('error', error)
        return
      }

      this.push(data)
      if (!data || data.length < length) {
        this.push(null) // the large object has no more data left
      }
    })
  }
}
