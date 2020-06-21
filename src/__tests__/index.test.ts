import postgres from 'postgres'
import * as fs from 'fs'
import * as pglo from '..'
import { expect } from 'chai'
import * as crypto from 'crypto'

const connectionURL = 'postgres://nodetest:nodetest@localhost/nodetest'
const testFile = __dirname + '/../../assets/postgresjs.svg'
const testOutFile = __dirname + '/../../assets/out.svg'
const testFileSize = fs.statSync(testFile).size
const testBuf = new Buffer('0123456789ABCDEF', 'hex')

const sha256_hex = (filename: string): Promise<string> => {
  const sum = crypto.createHash('sha256')
  const s = fs.createReadStream(filename)

  s.on('data', (data) => sum.update(data))

  return new Promise((resolve, reject) => {
    s.on('error', reject)
    s.on('end', () => resolve(sum.digest('hex')))
  })
}

describe('LargeObjectManager', () => {
  let sql: postgres.Sql<never>
  let oid: number

  beforeAll(async () => {
    sql = postgres(connectionURL)
  })

  afterAll(async () => {
    await sql.end()
  })

  test('create', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      oid = await manager.createAsync()
      expect(oid).not.equal(0)
      console.log('creating a new Large Object with oid: ', oid)
    })
  })

  test('write', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.WRITE)
      await obj.writeAsync(testBuf)
      await obj.closeAsync()
    })
  })

  test('read first 2 byte', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.READ)
      const buf = await obj.readAsync(2)
      await obj.closeAsync()

      expect(buf).have.length(2)
      expect(buf[0]).equal(testBuf[0])
      expect(buf[1]).equal(testBuf[1])
    })
  })

  test('tell', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.READ)
      await obj.readAsync(2)
      const position = await obj.tellAsync()
      await obj.closeAsync()

      expect(position).equal(2)
    })
  })

  test('size', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.READ)
      const size = await obj.sizeAsync()
      await obj.closeAsync()

      expect(size).equal(testBuf.length)
    })
  })

  test('tell after size', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.READ)
      await obj.readAsync(2)
      await obj.sizeAsync()
      const position = await obj.tellAsync()
      await obj.closeAsync()

      expect(position).equal(2, 'calling size() should not change the position')
    })
  })

  test('read with buffer size larger than size', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.READ)
      await obj.readAsync(2)
      const buf = await obj.readAsync(100)
      await obj.closeAsync()

      expect(buf).have.length(6)
      for (let i = 0; i < 6; i++) {
        expect(buf[i]).equal(testBuf[i + 2])
      }
    })
  })

  test('seek', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const obj = await manager.openAsync(oid, pglo.LargeObjectManager.READ)
      await obj.readAsync(2)
      await obj.seekAsync(-2, pglo.LargeObject.SEEK_END)
      const buf = await obj.readAsync(100)
      await obj.closeAsync()

      expect(buf).have.length(2)
      expect(buf[0]).equal(testBuf[6])
      expect(buf[1]).equal(testBuf[7])
    })
  })

  test('unlink', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      console.log('unlinking the Large Object with oid: ', oid)
      await manager.unlinkAsync(oid)
    })
  })

  test('write stream', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const [_oid, stream] = await manager.createAndWritableStreamAsync()
      oid = _oid
      console.log('creating a new Large Object with oid: ', oid)

      const fileStream = fs.createReadStream(testFile)
      fileStream.pipe(stream)

      await new Promise((resolve, reject) => {
        stream.on('error', reject)
        stream.on('finish', resolve)
      })
    })
  })

  test('read stream', async () => {
    await sql.begin(async (trx) => {
      const manager = new pglo.LargeObjectManager(trx)
      const origHash = await sha256_hex(testFile)

      const [size, stream] = await manager.openAndReadableStreamAsync(oid)
      expect(size).equal(testFileSize)

      const fileStream = fs.createWriteStream(testOutFile)
      stream.pipe(fileStream)

      await new Promise((resolve, reject) => {
        stream.on('end', resolve)
        stream.on('error', reject)
      })

      const outHash = await sha256_hex(testOutFile)
      expect(outHash).equal(origHash)

      console.log('unlinking the Large Object with oid: ', oid)
      await manager.unlinkAsync(oid)
    })
  })
})
