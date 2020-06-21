# postgres-large-object

![GitHub Workflow Status](https://img.shields.io/github/workflow/status/yckao/postgres-large-object/Test)
![GitHub](https://img.shields.io/github/license/yckao/postgres-large-object)
[![codecov](https://codecov.io/gh/yckao/postgres-large-object/branch/master/graph/badge.svg)](https://codecov.io/gh/yckao/postgres-large-object)
![npm](https://img.shields.io/npm/dw/postgres-large-object)
![npm](https://img.shields.io/npm/v/postgres-large-object)

Large object support for PostgreSQL clients using the [postgres](https://www.npmjs.com/package/postgres) library.

The API of this library is exactly same with [node-postgres-large-object](https://www.npmjs.com/package/node-pg-large-object) and resembles the JDBC library for PostgreSQL.

## Installation

```
npm install --save postgres-large-object
```

You will also need to install [postgres](https://www.npmjs.com/package/postgres) library.
Currently only test with postgres@beta

```
npm install --save postgres@beta
```

Some of the methods in this library require PostgreSQL 9.3 (server) and up:

- LargeObject.seek()
- LargeObject.tell()
- LargeObject.size()
- LargeObject.truncate()

All other methods should work on PostgreSQL 8.4 and up.

## Large Objects

Large Objects in PostgreSQL lets you store files/objects up to 4 TiB in size. The main benefit
of using Large Objects instead of a simple column is that the data can be read and written in
chunks (e.g. as a stream), instead of having to load the entire column into memory.

## Examples

library exposes a callback style interface (for backwards compatibility) and a promise style
interface (see [API Documentation](#api-documentation)). All functions that end with "Async" will return a promise

### Reading a large object using a stream:

```javascript
const postgres = require('postgres')
const { LargeObjectManager } = require('postgres-large-object')
const { createWriteStream } = require('fs')

const sql = postgres('postgres://postgres:1234@localhost/postgres')

// When working with Large Objects, always use a transaction
sql
  .begin((tx) => {
    const man = new LargeObjectManager(tx)

    // A LargeObject oid, probably stored somewhere in one of your own tables.
    const oid = 123

    // If you are on a high latency connection and working with
    // large LargeObjects, you should increase the buffer size.
    // The buffer should be divisible by 2048 for best performance
    // (2048 is the default page size in PostgreSQL, see LOBLKSIZE)
    const bufferSize = 16384

    return man.openAndReadableStreamAsync(oid, bufferSize).then(([size, stream]) => {
      console.log('Streaming a large object with a total size of', size)

      // Store it as an image
      const fileStream = createWriteStream('my-file.png')
      stream.pipe(fileStream)

      return new Promise((resolve, reject) => {
        stream.on('end', resolve)
        stream.on('error', reject)
      })
    })
  })
  .then(() => {
    console.log('Done!')
  })
  .catch((error) => {
    console.log('Something went horribly wrong!', error)
  })
```

### Creating a new large object using a stream and pg-promise:

```javascript
const postgres = require('postgres')
const { LargeObjectManager } = require('postgres-large-object')
const { createReadStream } = require('fs')

const sql = postgres('postgres://postgres:1234@localhost/postgres')

// When working with Large Objects, always use a transaction
sql
  .begin((tx) => {
    const man = new LargeObjectManager(tx)

    // If you are on a high latency connection and working with
    // large LargeObjects, you should increase the buffer size.
    // The buffer should be divisible by 2048 for best performance
    // (2048 is the default page size in PostgreSQL, see LOBLKSIZE)
    const bufferSize = 16384

    return man.createAndWritableStreamAsync(bufferSize).then(([oid, stream]) => {
      // The server has generated an oid
      console.log('Creating a large object with the oid', oid)

      const fileStream = createReadStream('upload-my-file.png')
      fileStream.pipe(stream)

      return new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
      })
    })
  })
  .then(() => {
    console.log('Done!')
  })
  .catch((error) => {
    console.log('Something went horribly wrong!', error)
  })
```

## Testing

You can test this library by running:

```
npm install postgres-large-object
npm test
```

The test assumes that postgres://nodetest:nodetest@localhost/nodetest is a valid database.
Or specify connection URL with environment variable POSTGRES_URL
