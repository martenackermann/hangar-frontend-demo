import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { notify } from '@/components/ui/toast'
import { coreQueries, useAppConfig } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import { homePathFor } from '@/lib/auth/guards'
import { personaLogin } from '@/lib/auth/session'
import { useMe } from '@/lib/auth/store'
import { cn } from '@/lib/utils'

/**
 * PersonaSwitcher (DESIGN.md §10, demo only): dashed pill with initials · name · amber-wash
 * "Demo" tag. Radio list of personas (SPEC §3.3) with role and story; switching reloads data
 * under that role and toasts "You are now Theo Technician (technician)".
 */
export function PersonaSwitcher({ compact = false }: { compact?: boolean }) {
  const config = useAppConfig()
  const me = useMe()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data } = useQuery({ ...coreQueries.personas(), enabled: Boolean(config?.demoMode) })
  if (!config?.demoMode || !me) return null
  const personas = data?.data ?? []
  const primary = personas.filter((p) => p.group === 'primary')
  const more = personas.filter((p) => p.group === 'more_technicians')

  const switchTo = async (email: string) => {
    if (email === me.email) return
    try {
      const response = await personaLogin(queryClient, email)
      await navigate({ to: homePathFor(response.user) })
      notify.success(`You are now ${response.user.displayName} (${response.user.role})`)
    } catch (error) {
      notify.error('Persona switch failed', {
        description: isApiError(error) ? error.detail : undefined,
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Demo persona: ${me.displayName}. Switch persona`}
        className={cn(
          'flex h-7 items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface pr-2 pl-[3px] whitespace-nowrap hover:border-solid',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        )}
      >
        <Avatar name={me.displayName} />
        {!compact && <span className="font-medium max-xl:hidden">{me.displayName}</span>}
        <span className="rounded-xs bg-accent-wash px-[5px] text-2xs leading-4 font-semibold text-accent-text">
          Demo
        </span>
        <Icon icon={ChevronDown} size={14} className="text-fg-3 max-md:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>Switch persona (demo)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={me.email} onValueChange={(email) => void switchTo(email)}>
          {primary.map((persona) => (
            <DropdownMenuRadioItem
              key={persona.email}
              value={persona.email}
              description={`${persona.roleLabel} · ${persona.description}`}
            >
              {persona.displayName}
            </DropdownMenuRadioItem>
          ))}
          {more.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>More technicians</DropdownMenuLabel>
              {more.map((persona) => (
                <DropdownMenuRadioItem
                  key={persona.email}
                  value={persona.email}
                  description={persona.description}
                >
                  {persona.displayName}
                </DropdownMenuRadioItem>
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
