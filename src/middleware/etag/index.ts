import type { MiddlewareHandler } from '../../types'
import { sha1 } from '../../utils/crypto'

type ETagOptions = {
  retainedHeaders?: string[]
  weak?: boolean
}

/**
 * Default headers to pass through on 304 responses. From the spec:
 * > The response must not contain a body and must include the headers that
 * > would have been sent in an equivalent 200 OK response: Cache-Control,
 * > Content-Location, Date, ETag, Expires, and Vary.
 */
const RETAINED_304_HEADERS = [
  'cache-control',
  'content-location',
  'date',
  'etag',
  'expires',
  'vary',
]

function etagMatches(etag: string, ifNoneMatch: string | null) {
  return ifNoneMatch != null && ifNoneMatch.split(/,\s*/).indexOf(etag) > -1
}

/**
 * ETag middleware for Hono.
 *
 * @see {@link https://hono.dev/middleware/builtin/etag}
 *
 * @param {ETagOptions} [options] - The options for the ETag middleware.
 * @param {boolean} [options.weak=false] - Define using or not using a weak validation. If true is set, then `W/` is added to the prefix of the value.
 * @returns {MiddlewareHandler} The middleware handler function.
 *
 * @example
 * ```ts
 * const app = new Hono()
 *
 * app.use('/etag/*', etag())
 * app.get('/etag/abc', (c) => {
 *   return c.text('Hono is cool')
 * })
 * ```
 */
export const etag = (options?: ETagOptions): MiddlewareHandler => {
  const retainedHeaders = options?.retainedHeaders ?? RETAINED_304_HEADERS
  const weak = options?.weak ?? false

  return async function etag(c, next) {
    const ifNoneMatch = c.req.header('If-None-Match') ?? null

    await next()

    const res = c.res as Response
    let etag = res.headers.get('ETag')

    if (!etag) {
      const hash = await sha1(res.clone().body || '')
      etag = weak ? `W/"${hash}"` : `"${hash}"`
    }

    if (etagMatches(etag, ifNoneMatch)) {
      await c.res.blob() // Force using body
      c.res = new Response(null, {
        status: 304,
        statusText: 'Not Modified',
        headers: {
          ETag: etag,
        },
      })
      c.res.headers.forEach((_, key) => {
        if (retainedHeaders.indexOf(key.toLowerCase()) === -1) {
          c.res.headers.delete(key)
        }
      })
    } else {
      c.res.headers.set('ETag', etag)
    }
  }
}
