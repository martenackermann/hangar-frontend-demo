import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import { isApiError, ROOT_ERROR_KEY } from '@/lib/api/errors'

/**
 * Push an API validation error into a react-hook-form instance.
 *
 *   const mutation = useMutation({ ..., meta: { errorToast: false } })
 *   const onSubmit = form.handleSubmit(async (values) => {
 *     try { await mutation.mutateAsync(values) }
 *     catch (error) { applyServerErrors(error, form.setError) }
 *   })
 *
 * Field paths the form does not know (pass `knownFields`) and non-field errors land in
 * `errors.root.server`. Returns false when the error carried nothing form-related.
 */
export function applyServerErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  knownFields?: readonly FieldPath<TValues>[],
): boolean {
  if (!isApiError(error)) return false

  const rootMessages: string[] = []
  let applied = false

  for (const [path, messages] of Object.entries(error.fieldErrors)) {
    const message = messages.join(' ')
    const isKnown =
      path !== ROOT_ERROR_KEY && (!knownFields || knownFields.includes(path as FieldPath<TValues>))
    if (isKnown) {
      setError(path as FieldPath<TValues>, { type: 'server', message })
      applied = true
    } else {
      rootMessages.push(message)
    }
  }

  if (rootMessages.length > 0 || !applied) {
    setError('root.server', {
      type: 'server',
      message: rootMessages.length > 0 ? rootMessages.join(' ') : (error.detail ?? error.title),
    })
  }
  return true
}
