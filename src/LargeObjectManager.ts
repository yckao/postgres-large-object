import { Sql } from 'postgres'
import LargeObject from './LargeObject'
import { callbackify, isNumber } from 'util'
import ReadStream from './ReadStream'
import WriteStream from './WriteStream'

enum MODE {
  WRITE = 0x00020000,
  READ = 0x00040000,
  READWRITE = 0x00020000 | 0x00040000,
}

/** This class lets you use the Large Object functionality of PostgreSQL.
 * All usage of Large Object should take place within a transaction block!
 * (BEGIN ... COMMIT)
 *
 * @example new LargeObjectManager(client)
 * @constructor
 * @exports postgres-large-object/lib/LargeObjectManager
 * @param {module:postgres/Sql} sql A postgres (https://www.npmjs.com/package/postgres) transaction
 *         object as given by `sql.begin(fn)`
 */
class LargeObjectManager {
  public static WRITE = MODE.WRITE
  public static READ = MODE.READ
  public static READWRITE = MODE.READWRITE

  private _sql: Sql<never>
  constructor(sql: Sql<never>) {
    this._sql = sql
  }

  /** Open an existing large object, based on its OID.
   * In mode READ, the data read from it will reflect the
   * contents of the large object at the time of the transaction
   * snapshot that was active when open was executed,
   * regardless of later writes by this or other transactions.
   * If opened using WRITE (or READWRITE), data read will reflect
   * all writes of other committed transactions as well as
   * writes of the current transaction.
   * @param {Number} oid
   * @param {Number} mode One of WRITE, READ, or READWRITE
   * @returns {Promise.<module:postgres-large-object/lib/LargeObject>}
   */
  public openAsync = async (oid: number, mode: MODE): Promise<LargeObject> => {
    if (!oid) {
      throw Error('Illegal Argument')
    }
    const [{ fd }] = await this._sql<[{ fd: number }]>`SELECT lo_open(${oid}, ${mode}) AS fd`
    return new LargeObject(this._sql, oid, fd)
  }

  /** @callback module:postgres-large-object/lib/LargeObjectManager~openCallback
   * @param {?Error} error If set, an error occurred.
   * @param {module:postgres-large-object/lib/LargeObject} result
   */
  /** Open an existing large object, based on its OID.
   * In mode READ, the data read from it will reflect the
   * contents of the large object at the time of the transaction
   * snapshot that was active when open was executed,
   * regardless of later writes by this or other transactions.
   * If opened using WRITE (or READWRITE), data read will reflect
   * all writes of other committed transactions as well as
   * writes of the current transaction.
   * @param {Number} oid
   * @param {Number} mode One of WRITE, READ, or READWRITE
   * @param {module:postgres-large-object/lib/LargeObjectManager~openCallback} callback
   */
  public open = callbackify(this.openAsync)

  /** Creates a large object, returning its OID.
   * After which you can open() it.
   * @returns {Promise.<number>} oid
   */
  public createAsync = async (): Promise<number> => {
    const [{ oid }] = await this._sql<[{ oid: number }]>`SELECT lo_creat(${LargeObjectManager.READWRITE}) as oid`
    return oid
  }

  /** @callback module:postgres-large-object/lib/LargeObjectManager~createCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Number} oid
   */
  /** Creates a large object, returning its OID.
   * After which you can open() it.
   * @param {module:postgres-large-object/lib/LargeObjectManager~createCallback} callback
   */
  public create = callbackify(this.createAsync)

  /** Unlinks (deletes) a large object
   * @param {number} oid
   * @returns {Promise}
   */
  public unlinkAsync = async (oid: number): Promise<void> => {
    if (!oid) {
      throw Error('Illegal Argument')
    }

    await this._sql`SELECT lo_unlink(${oid}) AS ok`
  }

  /** @callback module:postgres-large-object/lib/LargeObjectManager~unlinkCallback
   * @param {?Error} error If set, an error occurred.
   */
  /** Unlinks (deletes) a large object
   * @param {number} oid
   * @param {module:postgres-large-object/lib/LargeObjectManager~unlinkCallback} [callback]
   */
  public unlink = callbackify(this.unlinkAsync)

  /** Open a large object, return a stream and close the object when done streaming.
   * Only call this within a transaction block.
   * @param {Number} oid
   * @param {Number} [bufferSize=16384]
   * @returns {Promise.<Array>} The total size and a ReadStream
   *
   */
  public openAndReadableStreamAsync = async (
    oid: number,
    bufferSize: number = 16384,
  ): Promise<[number, ReadStream]> => {
    const obj = await this.openAsync(oid, LargeObjectManager.READ)
    const size = await obj.sizeAsync()
    const stream = obj.getReadableStream(bufferSize)
    stream.on('end', async () => {
      try {
        await obj.closeAsync()
      } catch (err) {
        console.error('Warning: closing a large object failed:', err)
      }
    })
    return [size, stream]
  }
  /** @callback module:postgres-large-object/lib/LargeObjectManager~openAndReadableStreamCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Number} size The total size of the large object
   * @param {module:postgres-large-object/lib/ReadStream} stream
   */
  /** Open a large object, return a stream and close the object when done streaming.
   * Only call this within a transaction block.
   * @param {Number} oid
   * @param {Number} [bufferSize=16384]
   * @param {module:postgres-large-object/lib/LargeObjectManager~openAndReadableStreamCallback} callback
   *
   */
  public openAndReadableStream: {
    (oid: number, callback: (error?: Error, size?: number, stream?: ReadStream) => unknown): void
    (oid: number, bufferSize: number, callback: (error?: Error, size?: number, stream?: ReadStream) => unknown): void
  } = (oid: number, ...args: unknown[]): void => {
    const bufferSize = isNumber(args[0]) ? args[0] : 16384
    const callback = (isNumber(args[0]) ? args[1] : args[0]) as (
      error?: Error,
      size?: number,
      stream?: ReadStream,
    ) => unknown
    this.openAndReadableStreamAsync(oid, bufferSize)
      .then(([size, stream]) => callback(undefined, size, stream))
      .catch((err) => callback(err))
  }

  /** Create and open a large object, return a stream and close the object when done streaming.
   * Only call this within a transaction block.
   * @param {Number} [bufferSize=16384]
   * @returns {promise.<Array>} The oid and a WriteStream
   */
  public createAndWritableStreamAsync = async (bufferSize: number = 16384): Promise<[number, WriteStream]> => {
    const oid = await this.createAsync()
    const obj = await this.openAsync(oid, LargeObjectManager.WRITE)
    const stream = obj.getWritableStream(bufferSize)
    stream.on('finish', async () => {
      try {
        await obj.closeAsync()
      } catch (err) {
        console.error('Warning: closing a large object failed:', err)
      }
    })
    return [oid, stream]
  }

  /** @callback module:postgres-large-object/lib/LargeObjectManager~createAndWritableStreamCallback
   * @param {?Error} error If set, an error occurred.
   * @param {Number} oid
   * @param {module:postgres-large-object/lib/WriteStream} stream
   */
  /** Create and open a large object, return a stream and close the object when done streaming.
   * Only call this within a transaction block.
   * @param {Number} [bufferSize=16384]
   * @param {module:postgres-large-object/lib/LargeObjectManager~createAndWritableStreamCallback} [callback]
   */
  public createAndWritableStream: {
    (callback: (error?: Error, oid?: number, stream?: WriteStream) => unknown): void
    (bufferSize: number, callback: (error?: Error, oid?: number, stream?: WriteStream) => unknown): void
  } = (...args: unknown[]): void => {
    const bufferSize = isNumber(args[0]) ? args[0] : 16384
    const callback = (isNumber(args[0]) ? args[1] : args[0]) as (
      error?: Error,
      size?: number,
      stream?: WriteStream,
    ) => unknown
    this.createAndWritableStreamAsync(bufferSize)
      .then(([oid, stream]) => callback(undefined, oid, stream))
      .catch((err) => callback(err))
  }
}

export = LargeObjectManager
