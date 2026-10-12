import { describe, expect, it } from 'vitest'
import { ApiError, ROOT_ERROR_KEY, toApiError, toFieldPath, toNetworkError } from './errors'

describe('toApiError', () => {
  it('reads an RFC 9457 problem document with field errors', () => {
    const error = toApiError(
      {
        type: 'https://example.com/problems/validation',
        title: 'Validation failed',
        status: 422,
        detail: 'Some fields are invalid.',
        errors: [
          { field: 'serial', message: 'Unknown serial number.' },
          { field: 'items.0.assetTag', message: 'Required.' },
          { field: 'serial', message: 'Already assigned.' },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.title).toBe('Validation failed')
    expect(error.detail).toBe('Some fields are invalid.')
    expect(error.isValidationError).toBe(true)
    expect(error.fieldErrors).toEqual({
      serial: ['Unknown serial number.', 'Already assigned.'],
      'items.0.assetTag': ['Required.'],
    })
  })

  it('reads FastAPI default validation errors ({ detail: [{ loc, msg }] })', () => {
    const error = toApiError(
      {
        detail: [
          {
            loc: ['body', 'email'],
            msg: 'value is not a valid email address',
            type: 'value_error',
          },
          { loc: ['query', 'page'], msg: 'Input should be greater than 0', type: 'greater_than' },
          { loc: ['body'], msg: 'Field required', type: 'missing' },
        ],
      },
      { status: 422, statusText: '' },
    )

    expect(error.title).toBe('Validation failed')
    expect(error.detail).toBeUndefined()
    expect(error.fieldErrors).toEqual({
      email: ['value is not a valid email address'],
      page: ['Input should be greater than 0'],
      [ROOT_ERROR_KEY]: ['Field required'],
    })
  })

  it('accepts a field -> messages map and JSON pointers', () => {
    expect(
      toApiError(
        { errors: { name: ['Too short'], 'site.id': 'Unknown site' } },
        { status: 400, statusText: '' },
      ).fieldErrors,
    ).toEqual({
      name: ['Too short'],
      'site.id': ['Unknown site'],
    })
    expect(toFieldPath('/items/2/serial')).toBe('items.2.serial')
    expect(toFieldPath('items[2].serial')).toBe('items.2.serial')
    expect(toFieldPath(undefined)).toBe(ROOT_ERROR_KEY)
  })

  it('falls back to the HTTP status for plain-text and HTML bodies', () => {
    const text = toApiError('Upstream timeout', { status: 504, statusText: 'Gateway Timeout' })
    expect(text.title).toBe('Gateway Timeout')
    expect(text.detail).toBe('Upstream timeout')

    const html = toApiError('<html><body>Bad Gateway</body></html>', {
      status: 502,
      statusText: '',
    })
    expect(html.title).toBe('Bad gateway')
    expect(html.detail).toBeUndefined()
  })

  it('wraps thrown errors as network errors (status 0)', () => {
    const error = toNetworkError(new TypeError('Failed to fetch'))
    expect(error.status).toBe(0)
    expect(error.isNetworkError).toBe(true)
    expect(error.detail).toBe('Failed to fetch')
    expect(toNetworkError(error)).toBe(error)
  })
})
