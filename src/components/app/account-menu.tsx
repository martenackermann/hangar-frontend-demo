import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Keyboard, LogOut } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { logout } from '@/lib/auth/session'
import { setPrefs, usePrefs, type Theme } from '@/lib/prefs/store'
import { setShortcutsOpen } from './command-palette-store'

/** Account items (shortcuts, theme, log out): the user menu, or the persona menu in the demo. */
export function AccountMenuItems() {
  const theme = usePrefs((prefs) => prefs.theme)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <>
      <DropdownMenuItem icon={Keyboard} shortcut="?" onSelect={() => setShortcutsOpen(true)}>
        Keyboard shortcuts
      </DropdownMenuItem>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => setPrefs({ theme: value as Theme })}
      >
        <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        icon={LogOut}
        onSelect={() => {
          void logout(queryClient).then(() => navigate({ to: '/login', search: {} }))
        }}
      >
        Log out
      </DropdownMenuItem>
    </>
  )
}
