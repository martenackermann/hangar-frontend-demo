import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleAlert, Power, PowerOff, Save } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Banner, Skeleton, ToneBadge } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import type { ArticleCategory, ArticleDetail, ArticleSiteSetting } from '@/lib/api/types'
import { isApiError } from '@/lib/api/errors'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { formatDate, formatNumber } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import { articleQueries, useArticleActive, useSaveArticle, useSaveSiteSetting } from '../api'

/**
 * Article drawer body (SCREENS.md §9.1): form with every `ArticleInput` field, per-hub site
 * settings (min/max editable; buffer, stock and demand read-only with a link to the stock
 * matrix) and Activate/Deactivate.
 */
const CATEGORIES = [
  'laptop',
  'desktop',
  'tablet',
  'docking_station',
  'monitor',
  'headset',
  'keyboard',
  'mouse',
  'webcam',
  'bag',
  'accessory',
] as const satisfies readonly ArticleCategory[]

const schema = z.object({
  number: z.string().trim().min(1, 'Required.').max(16),
  category: z.enum(CATEGORIES, { message: 'Choose a category.' }),
  name: z.string().trim().min(1, 'Required.').max(120),
  modelNumber: z.string().trim().min(1, 'Required.').max(80),
  manufacturer: z.string().trim().min(1, 'Required.').max(80),
  externalPartNumber: z.string().trim().max(40),
  internalDescription: z.string().trim().min(1, 'Required.').max(120),
  weightKg: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'A weight in kg, e.g. 1.6.'),
})
type FormValues = z.infer<typeof schema>
const FIELDS = Object.keys(schema.shape) as (keyof FormValues)[]

function toForm(article: ArticleDetail | undefined): FormValues {
  return {
    number: article?.number ?? '',
    category: article?.category ?? ('' as ArticleCategory),
    name: article?.name ?? '',
    modelNumber: article?.modelNumber ?? '',
    manufacturer: article?.manufacturer ?? '',
    externalPartNumber: article?.externalPartNumber ?? '',
    internalDescription: article?.internalDescription ?? '',
    weightKg: article ? String(article.weightKg) : '1.00',
  }
}

export function ArticleEditor({
  id,
  onCreated,
}: {
  /** `null` = new article. */
  id: number | null
  onCreated: (article: ArticleDetail) => void
}) {
  const query = useQuery({ ...articleQueries.detail(id ?? 0), enabled: id !== null })
  if (id !== null && query.isPending) {
    return (
      <div className="grid gap-3 px-4 py-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (id !== null && (query.error || !query.data)) {
    return (
      <div className="px-4 py-4">
        <Banner tone="critical" icon={CircleAlert} title="The article could not be loaded" />
      </div>
    )
  }
  return <ArticleForm key={id ?? 'new'} article={query.data} onCreated={onCreated} />
}

function ArticleForm({
  article,
  onCreated,
}: {
  article: ArticleDetail | undefined
  onCreated: (article: ArticleDetail) => void
}) {
  const enums = useEnums()
  const canManage = useCan('master.manage')
  const save = useSaveArticle(article?.id ?? null)
  const toggle = useArticleActive()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(article),
  })
  const {
    register,
    control,
    formState: { errors, isDirty },
  } = form

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        ...values,
        externalPartNumber: values.externalPartNumber || null,
        weightKg: Number(values.weightKg),
      })
      form.reset(toForm(saved))
      if (!article) onCreated(saved)
    } catch (error) {
      applyServerErrors(error, form.setError, FIELDS)
    }
  })
  useShortcut('mod+s', () => void onSubmit(), {
    enabled: canManage,
    allowInInput: true,
    description: 'Save article',
    group: 'Form',
  })

  const text = (
    name: keyof FormValues,
    label: string,
    options: { mono?: boolean; required?: boolean; help?: string } = {},
  ) => (
    <Field
      label={label}
      required={options.required}
      error={errors[name]?.message}
      help={options.help}
    >
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          readOnly={!canManage}
          className={options.mono ? 'font-mono' : undefined}
          {...register(name)}
        />
      )}
    </Field>
  )

  return (
    <div className="grid gap-4 px-4 pt-3 pb-6">
      <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3" noValidate>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {text('number', 'Article number', { mono: true, required: true })}
          <Field label="Category" required error={errors.category?.message}>
            {({ id }) => (
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select<ArticleCategory>
                    id={id}
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={!canManage}
                    placeholder="Choose…"
                    options={CATEGORIES.map((value) => ({
                      value,
                      label: enumLabel(enums, 'articleCategory', value),
                    }))}
                  />
                )}
              />
            )}
          </Field>
          {text('name', 'Name', { required: true })}
          {text('manufacturer', 'Manufacturer', { required: true })}
          {text('modelNumber', 'Model number', {
            mono: true,
            required: true,
            help: 'Assets reference it on import.',
          })}
          {text('externalPartNumber', 'Partner part number', { mono: true })}
        </div>
        {text('internalDescription', 'Device type', {
          required: true,
          help: 'What service requests order (unique among active articles).',
        })}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {text('weightKg', 'Weight (kg)', { mono: true, required: true, help: 'Parcel weight.' })}
        </div>
        {errors.root?.server && (
          <Banner tone="critical" icon={CircleAlert} title="Not saved">
            {errors.root.server.message}
          </Banner>
        )}
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              icon={Save}
              shortcut="mod+s"
              loading={save.isPending}
              disabled={article !== undefined && !isDirty}
            >
              {article ? 'Save changes' : 'Create article'}
            </Button>
            {article && (
              <Button
                type="button"
                icon={article.isActive ? PowerOff : Power}
                loading={toggle.isPending}
                onClick={() =>
                  void toggle.mutateAsync({ id: article.id, active: !article.isActive })
                }
              >
                {article.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            )}
          </div>
        )}
      </form>

      {article && (
        <>
          <SectionHeading
            actions={
              <Link to="/stock/matrix" className="text-xs text-accent-text hover:underline">
                Stock matrix
              </Link>
            }
          >
            Per hub
          </SectionHeading>
          <SiteSettingsTable article={article} editable={canManage} />
          <p className="text-xs text-fg-3">
            {formatNumber(article.assetCount)} assets in the fleet ·{' '}
            {formatNumber(article.openDemand)} on open requests · created{' '}
            {formatDate(article.createdAt)}
          </p>
        </>
      )}
    </div>
  )
}

function SiteSettingsTable({ article, editable }: { article: ArticleDetail; editable: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-fg-3">
          <th scope="col" className="py-1.5 pr-2 font-medium">
            Hub
          </th>
          <th scope="col" className="py-1.5 pr-2 font-medium">
            Min
          </th>
          <th scope="col" className="py-1.5 pr-2 font-medium">
            Max
          </th>
          <th scope="col" className="py-1.5 pr-2 text-right font-medium">
            Buffer
          </th>
          <th scope="col" className="py-1.5 pr-2 text-right font-medium">
            Stock
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Demand
          </th>
        </tr>
      </thead>
      <tbody>
        {article.siteSettings.map((setting) => (
          <SiteSettingRow
            key={`${setting.site.id}-${setting.minQty}-${setting.maxQty}`}
            articleId={article.id}
            setting={setting}
            editable={editable}
          />
        ))}
      </tbody>
    </table>
  )
}

function SiteSettingRow({
  articleId,
  setting,
  editable,
}: {
  articleId: number
  setting: ArticleSiteSetting
  editable: boolean
}) {
  const save = useSaveSiteSetting(articleId)
  const [min, setMin] = useState(setting.minQty === null ? '' : String(setting.minQty))
  const [max, setMax] = useState(setting.maxQty === null ? '' : String(setting.maxQty))
  const [error, setError] = useState<string | null>(null)

  const commit = async () => {
    const next = {
      minQty: min === '' ? null : Number(min),
      maxQty: max === '' ? null : Number(max),
    }
    if (next.minQty === setting.minQty && next.maxQty === setting.maxQty) return
    if ([next.minQty, next.maxQty].some((v) => v !== null && (!Number.isInteger(v) || v < 0))) {
      setError('Whole numbers ≥ 0.')
      return
    }
    setError(null)
    try {
      await save.mutateAsync({ siteId: setting.site.id, ...next })
    } catch (cause) {
      setError(
        isApiError(cause)
          ? Object.values(cause.fieldErrors).flat().join(' ') || (cause.detail ?? cause.title)
          : 'Not saved.',
      )
    }
  }
  const qty = (value: string, setValue: (v: string) => void, label: string) =>
    editable ? (
      <Input
        inputMode="numeric"
        aria-label={`${label} at ${setting.site.name}`}
        value={value}
        onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void commit()
        }}
        className="w-16 font-mono"
      />
    ) : (
      <span className="font-mono">{value || '—'}</span>
    )

  return (
    <>
      <tr className="border-b border-line-subtle">
        <td className="py-1.5 pr-2">{setting.site.name}</td>
        <td className="py-1.5 pr-2">{qty(min, setMin, 'Min')}</td>
        <td className="py-1.5 pr-2">{qty(max, setMax, 'Max')}</td>
        <td className="py-1.5 pr-2 text-right font-mono text-fg-2">{setting.bufferQty}</td>
        <td className="py-1.5 pr-2 text-right font-mono text-fg-2">{setting.stockQty}</td>
        <td className="py-1.5 text-right font-mono text-fg-2">{setting.demandQty}</td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="pb-1.5">
            <ToneBadge tone="critical" icon={CircleAlert}>
              {error}
            </ToneBadge>
          </td>
        </tr>
      )}
    </>
  )
}
