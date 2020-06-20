import * as stream from 'stream'
import LargeObject from './LargeObject'

class WriteStream extends stream.Writable {
  private _largeObject: LargeObject
  constructor(largeObject: LargeObject, bufferSize: number) {
    super({
      highWaterMark: bufferSize || 16384,
      objectMode: false,
    })
    this._largeObject = largeObject
  }

  public _write = (chunk: Buffer, _: unknown, callback: (err?: Error) => void): void => {
    if (!Buffer.isBuffer(chunk)) {
      throw 'Illegal Argument'
    }
    this._largeObject.write(chunk, callback)
  }
}

export = WriteStream
