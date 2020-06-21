import { Sql } from 'postgres'
import { callbackify } from 'util'
import { ReadStream } from './ReadStream'
import { WriteStream } from './WriteStream'

enum SEEK_REF {
  SEEK_SET = 0,
  SEEK_CUR = 1,
  SEEK_END = 2,
}

/**
 * Represents an opened large object.
 * @constructor
 * @exports postgres-large-object/lib/LargeObject
 */
export class LargeObject {
  /**
   * A seek from the beginning of a object
   * @constant {number}
   */
  public static SEEK_SET = SEEK_REF.SEEK_SET
  /**
   * A seek from the current position
   * @constant {number}
   */
  public static SEEK_CUR = SEEK_REF.SEEK_CUR
  /**
   * A seek from the end of a object
   * @constant {number}
   */
  public static SEEK_END = SEEK_REF.SEEK_END

  public oid: number

  private _sql: Sql<never>
  private _fd: number

  constructor(sql: Sql<never>, oid: number, fd: number) {
    this._sql = sql
    this.oid = oid
    this._fd = fd
  }

  /** Closes this large object.
   *  You should no longer call any methods on this object.
   * @returns {Promise}
   */
  public closeAsync = async (): Promise<void> => {
    await this._sql<[{ ok: boolean }]>`SELECT lo_close(${this._fd}) as ok`
  }

  /** @callback module:postgres-large-object/lib/LargeObject~closeCallback
   * @param {?Error} error If set, an error occurred.
   */
  /** Closes this large object.
   *  You should no longer call any methods on this object.
   * @param {module:postgres-large-object/lib/LargeObject~closeCallback} [callback]
   */
  public close = callbackify(this.closeAsync)

  /** Reads some data from the large object.
   * @param {Number} length How many bytes to read
   * @returns {Promise.<Buffer>} The binary data that was read.
   *          If the length of this buffer is less than the supplied
   *          length param, there is no more data to be read.
   */
  public readAsync = async (length: number): Promise<Buffer> => {
    const [{ data }] = await this._sql<[{ data: Buffer }]>`SELECT loread(${this._fd}, ${length}) as data`
    return data
  }

  /** @callback module:postgres-large-object/lib/LargeObject~readCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Buffer} data The binary data that was read.
   *        If the length of this buffer is less than the supplied
   *        length param, there is no more data to be read.
   */
  /** Reads some data from the large object.
   * @param {Number} length How many bytes to read
   * @param {module:postgres-large-object/lib/LargeObject~readCallback} callback
   */
  public read = callbackify(this.readAsync)

  /** Writes some data to the large object.
   * @param {Buffer} buffer data to write
   * @returns {Promise}
   */
  public writeAsync = async (buffer: Buffer): Promise<void> => {
    await this._sql`SELECT lowrite(${this._fd}, ${buffer})`
  }

  /** @callback module:postgres-large-object/lib/LargeObject~writeCallback
   * @param {?Error} error If set, an error occurred.
   */
  /** Writes some data to the large object.
   * @param {Buffer} buffer data to write
   * @param {module:postgres-large-object/lib/LargeObject~writeCallback} [callback]
   */
  public write = callbackify(this.writeAsync)

  /** Sets the position within the large object.
   * Beware floating point rounding with values greater than 2^53 (8192 TiB)
   * @param {Number} position
   * @param {Number} ref One of SEEK_SET, SEEK_CUR, SEEK_END
   * @returns {Promise.<number>} The new position
   */
  public seekAsync = async (position: number, ref: SEEK_REF): Promise<number> => {
    const [{ location }] = await this._sql<[{ location: number }]>`SELECT lo_lseek64(${this._fd}, ${position}, ${ref})`
    return location
  }

  /** @callback module:postgres-large-object/lib/LargeObject~seekCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Number} position The new position
   */
  /** Sets the position within the large object.
   * Beware floating point rounding with values greater than 2^53 (8192 TiB)
   * @param {Number} position
   * @param {Number} ref One of SEEK_SET, SEEK_CUR, SEEK_END
   * @param {module:postgres-large-object/lib/LargeObject~seekCallback} [callback]
   */
  public seek = callbackify(this.seekAsync)

  /** Retrieves the current position within the large object.
   * Beware floating point rounding with values greater than 2^53 (8192 TiB)
   * @returns {Promise.<number>}
   */
  public tellAsync = async (): Promise<number> => {
    const [{ location }] = await this._sql<[{ location: number }]>`SELECT lo_tell64(${this._fd}) as location`
    return +location
  }

  /** @callback module:postgres-large-object/lib/LargeObject~tellCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Number} position The position
   */
  /** Retrieves the current position within the large object.
   * Beware floating point rounding with values greater than 2^53 (8192 TiB)
   * @param {module:postgres-large-object/lib/LargeObject~tellCallback} callback
   */
  public tell = callbackify(this.tellAsync)

  /** Find the total size of the large object.
   * @returns {Promise.<number>}
   */
  public sizeAsync = async (): Promise<number> => {
    const [{ size }] = await this._sql<[{ size: number }]>`
      SELECT lo_lseek64(${this._fd}, location, 0), seek.size FROM
        (SELECT lo_lseek64(${this._fd}, 0, 2) AS SIZE, tell.location FROM 
          (SELECT lo_tell64(${this._fd}) AS location) tell) seek;
    `
    return +size
  }

  /** @callback module:postgres-large-object/lib/LargeObject~sizeCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Number} size Object size in bytes
   */
  /** Find the total size of the large object.
   * @param {module:postgres-large-object/lib/LargeObject~sizeCallback} callback
   */
  public size = callbackify(this.sizeAsync)

  /** Truncates the large object to the given length in bytes.
   * If the number of bytes is larger than the current large
   * object length, the large object will be filled with zero
   * bytes.  This method does not modify the current file offset.
   * @param {Number} length
   * @returns {Promise}
   */
  public truncateAsync = async (length: number): Promise<void> => {
    await this._sql`SELECT lo_truncate(${this._fd}, ${length})`
  }

  /** @callback module:postgres-large-object/lib/LargeObject~truncateCallback
   * @param {?Error} error If set, an error occurred.
   */
  /** Truncates the large object to the given length in bytes.
   * If the number of bytes is larger than the current large
   * object length, the large object will be filled with zero
   * bytes.  This method does not modify the current file offset.
   * @param {Number} length
   * @param {module:postgres-large-object/lib/LargeObject~truncateCallback} [callback]
   */
  public truncate = callbackify(this.truncateAsync)

  /** Return a stream to read this large object.
   * Call this within a transaction block.
   * @param {Number} [bufferSize=16384] A larger buffer size will
   * require more memory on both the server and client, however it will make
   * transfers faster because there is less overhead (less read calls to the server).
   * his overhead is most noticeable on high latency connections because each
   * ransfered chunk will incur at least RTT of additional transfer time.
   * @returns {module:postgres-large-object/lib/ReadStream}
   */
  public getReadableStream = (bufferSize: number = 16384): ReadStream => {
    return new ReadStream(this, bufferSize)
  }

  /** Return a stream to write to this large object.
   * Call this within a transaction block.
   * @param {Number} [bufferSize=16384] A larger buffer size will
   * require more memory on both the server and client, however it will make
   * transfers faster because there is less overhead (less read calls to the server).
   * his overhead is most noticeable on high latency connections because each
   * ransfered chunk will incur at least RTT of additional transfer time.
   * @returns {module:postgres-large-object/lib/WriteStream}
   */
  public getWritableStream = (bufferSize: number = 16384): WriteStream => {
    return new WriteStream(this, bufferSize)
  }
}
