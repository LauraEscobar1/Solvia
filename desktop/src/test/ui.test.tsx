import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogOut, Menu as MenuIcon, Settings, Users } from 'lucide-react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DuePill, PriorityPill, RiskPill, StageProgress } from '@/components/requests/RequestPills'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/Card'
import { Checkbox, Switch } from '@/components/ui/Checkbox'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { FormField } from '@/components/ui/FormField'
import { IconButton } from '@/components/ui/IconButton'
import { Menu } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { RiskMeter, Stepper } from '@/components/ui/Progress'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { MultiSelectPill, SelectPill } from '@/components/ui/SelectPill'
import { QueryState } from '@/components/ui/States'
import { SortableTh, Table, Td, Th } from '@/components/ui/Table'
import { TextField } from '@/components/ui/TextField'
import type { RequestSummary } from '@/lib/api/types'
import { expectNoA11yViolations } from './a11y'
import { renderWithProviders } from './render'

const NOW = new Date('2026-10-15T12:00:00Z')

afterEach(() => {
  vi.useRealTimers()
})

function due(overrides: Partial<RequestSummary>): Pick<
  RequestSummary,
  'status' | 'due_at' | 'sla_status' | 'is_stalled' | 'last_activity_at'
> {
  return {
    status: 'assigned',
    due_at: '2026-10-18T12:00:00Z',
    sla_status: 'on_track',
    is_stalled: false,
    last_activity_at: '2026-10-15T10:00:00Z',
    ...overrides,
  }
}

describe('botones', () => {
  it('el estado de carga deshabilita el botón y lo marca como ocupado', () => {
    render(<Button loading>Guardar</Button>)

    const button = screen.getByRole('button', { name: 'Guardar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('el botón de ícono se nombra con su etiqueta y muestra el tooltip con el foco', async () => {
    const user = userEvent.setup()
    render(<IconButton label="Actualizar" icon={Settings} />)

    await user.tab()

    const button = screen.getByRole('button', { name: 'Actualizar' })
    expect(button).toHaveFocus()
    const tooltip = screen.getByText('Actualizar')
    expect(tooltip).toHaveAttribute('data-open', 'true')
    await user.keyboard('{Escape}')
    expect(tooltip).toHaveAttribute('data-open', 'false')
  })

  it('el chip expone si está activo', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [on, setOn] = useState(false)
      return (
        <Chip
          selected={on}
          onClick={() => {
            setOn(!on)
          }}
        >
          Solo en riesgo
        </Chip>
      )
    }
    render(<Harness />)

    const chip = screen.getByRole('button', { name: 'Solo en riesgo' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('control segmentado', () => {
  function Harness() {
    const [value, setValue] = useState<'list' | 'board'>('list')
    return (
      <SegmentedControl
        label="Vista"
        value={value}
        onChange={setValue}
        options={[
          { value: 'list', label: 'Lista' },
          { value: 'board', label: 'Tablero' },
        ]}
      />
    )
  }

  it('cambia con las flechas y deja una sola opción en el orden de tabulación', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.tab()
    expect(screen.getByRole('radio', { name: 'Lista' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')

    const board = screen.getByRole('radio', { name: 'Tablero' })
    expect(board).toHaveFocus()
    expect(board).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Lista' })).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{Home}')
    expect(screen.getByRole('radio', { name: 'Lista' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('diálogos', () => {
  function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true)
          }}
        >
          Abrir
        </button>
        {open && (
          <Dialog
            title="Nueva área"
            onClose={() => {
              setOpen(false)
            }}
            footer={<Button onClick={onConfirm}>Guardar</Button>}
          >
            <label>
              Nombre
              <input />
            </label>
          </Dialog>
        )}
      </>
    )
  }

  it('enfoca el primer campo, atrapa el foco y lo devuelve al cerrar con Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    const dialog = screen.getByRole('dialog', { name: 'Nueva área' })
    expect(within(dialog).getByRole('textbox', { name: 'Nombre' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('textbox', { name: 'Nombre' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('la confirmación enfoca Cancelar y avisa los errores', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Desactivar área"
        message="El área dejará de estar disponible."
        confirmLabel="Desactivar"
        error="No se pudo desactivar."
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Desactivar área' })
    expect(dialog).toHaveAccessibleDescription('El área dejará de estar disponible.')
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No se pudo desactivar.')
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

describe('menú', () => {
  it('se maneja con el teclado y devuelve el foco al cerrar', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    renderWithProviders(
      <Menu
        label="Menú de la cuenta"
        icon={MenuIcon}
        entries={[
          { kind: 'item', id: 'settings', label: 'Configuración', icon: Settings, to: '/settings' },
          {
            kind: 'group',
            id: 'admin',
            label: 'Administración',
            items: [{ kind: 'item', id: 'users', label: 'Usuarios', icon: Users, to: '/admin/users' }],
          },
          { kind: 'separator', id: 'sep' },
          { kind: 'item', id: 'out', label: 'Cerrar sesión', icon: LogOut, onSelect: onSignOut },
        ]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Menú de la cuenta' })
    await user.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Menú de la cuenta' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(menu).getByRole('menuitem', { name: 'Configuración' })).toHaveFocus()
    expect(within(menu).getByRole('group', { name: 'Administración' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Usuarios' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(within(menu).getByRole('menuitem', { name: 'Cerrar sesión' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('selectores en píldora', () => {
  it('el selector simple se nombra con su etiqueta', () => {
    render(
      <SelectPill label="Área" defaultValue="">
        <option value="">Todas</option>
      </SelectPill>,
    )

    expect(screen.getByRole('combobox', { name: 'Área' })).toHaveDisplayValue('Todas')
  })

  it('la selección múltiple abre una ventana con atajos y casillas', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState<string[]>(['received'])
      return (
        <MultiSelectPill
          label="Etapa"
          summary={value.join(',') || 'Todas'}
          value={value}
          onChange={setValue}
          presets={[{ label: 'Abiertas', values: ['received', 'assigned'] }]}
          options={[
            { value: 'received', label: 'Recibida' },
            { value: 'assigned', label: 'Asignada' },
          ]}
        />
      )
    }
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: /Etapa/ })
    await user.click(trigger)
    const panel = screen.getByRole('dialog', { name: 'Etapa' })
    expect(within(panel).getByRole('button', { name: 'Abiertas' })).toHaveFocus()

    await user.click(within(panel).getByRole('button', { name: 'Abiertas' }))
    expect(within(panel).getByRole('checkbox', { name: 'Asignada' })).toBeChecked()
    expect(trigger).toHaveTextContent('received,assigned')
    await user.click(within(panel).getByRole('checkbox', { name: 'Recibida' }))
    expect(trigger).toHaveTextContent('assigned')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('tablas y paginación', () => {
  it('el orden se anuncia en el encabezado de la columna', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    render(
      <Table caption="Solicitudes">
        <thead>
          <tr>
            <SortableTh label="Vencimiento" buttonLabel="Ordenar por Vencimiento" direction="ascending" onSort={onSort} />
            <Th>Área</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Hoy</Td>
            <Td>TI</Td>
          </tr>
        </tbody>
      </Table>,
    )

    expect(screen.getByRole('columnheader', { name: /Vencimiento/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: 'Ordenar por Vencimiento' }))
    expect(onSort).toHaveBeenCalledOnce()
  })

  it('la paginación numera las páginas y marca la actual', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={5} size={10} total={128} onPageChange={onPageChange} />)

    expect(screen.getByText('Mostrando 10 de 128')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 5' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Página 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 13' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Página 8' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(onPageChange).toHaveBeenCalledWith(6)
  })
})

describe('estados de carga, vacío y error', () => {
  const base = { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() }

  it('muestra carga, error con reintentar, vacío o el contenido', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    const { rerender } = render(
      <QueryState query={{ ...base, isPending: true }}>
        <p>Contenido</p>
      </QueryState>,
    )
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()

    rerender(
      <QueryState query={{ ...base, isError: true, error: new Error('x'), refetch }}>
        <p>Contenido</p>
      </QueryState>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar esta información.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()

    rerender(
      <QueryState query={{ ...base, data: [] }} isEmpty empty={<p>Nada por aquí</p>}>
        <p>Contenido</p>
      </QueryState>,
    )
    expect(screen.getByText('Nada por aquí')).toBeInTheDocument()

    rerender(
      <QueryState query={{ ...base, data: [1] }}>
        <p>Contenido</p>
      </QueryState>,
    )
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })
})

describe('píldoras de solicitudes', () => {
  it.each([
    [due({ sla_status: 'overdue', due_at: '2026-10-14T12:00:00Z', is_stalled: true }), 'Vencida hace 1 d'],
    [due({ sla_status: 'at_risk', due_at: '2026-10-16T06:00:00Z' }), 'Vence en 18 h'],
    [due({ is_stalled: true, last_activity_at: '2026-10-09T12:00:00Z' }), 'Sin movimiento 6 d'],
    [due({ due_at: '2026-10-18T12:00:00Z' }), 'Vence en 3 d'],
    [due({ due_at: null, sla_status: null }), 'Sin fecha límite'],
    [due({ status: 'completed' }), '—'],
  ])('el vencimiento prioriza vencida, por vencer y sin movimiento (%#)', (request, text) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    render(<DuePill request={request} />)

    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it.each([
    [91, 'Alto'],
    [64, 'Medio'],
    [22, 'Bajo'],
  ])('el riesgo %d se muestra como %s con su número', (score, level) => {
    render(<RiskPill score={score} />)

    const pill = screen.getByText(level)
    expect(pill).toHaveTextContent(`${level}${score}`)
    expect(pill).toHaveAttribute('title', `Riesgo ${score} de 100`)
  })

  it('la prioridad y la etapa se muestran con texto', () => {
    render(
      <>
        <PriorityPill priority="critical" prefixed />
        <StageProgress status="in_progress" />
      </>,
    )

    expect(screen.getByText('Prioridad Crítica')).toBeInTheDocument()
    expect(screen.getByText('En proceso')).toBeInTheDocument()
  })
})

describe('formularios', () => {
  it('el campo de contraseña permite mostrar y ocultar el texto', async () => {
    const user = userEvent.setup()
    render(
      <FormField label="Contraseña" htmlFor="password">
        <TextField id="password" type="password" revealable />
      </FormField>,
    )

    const input = screen.getByLabelText('Contraseña')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('el interruptor expone su estado', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch label="Notificaciones" checked={on} onChange={setOn} />
    }
    render(<Harness />)

    const toggle = screen.getByRole('switch', { name: 'Notificaciones' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})

describe('accesibilidad de los componentes base', () => {
  it('no tienen infracciones de axe', async () => {
    renderWithProviders(
      <main>
        <PageHeader
          title="Solicitudes"
          back={{ to: '/requests', label: 'Volver' }}
          breadcrumbs={[{ label: 'Solicitudes', to: '/requests' }, { label: 'SOL-0001' }]}
          actions={<Button variant="accent">Nueva solicitud</Button>}
        />
        <SectionCard title="Estado actual" description="Todas las cifras son de hoy">
          <RiskMeter value={72} label="Riesgo" />
          <Stepper
            label="Etapas"
            steps={[
              { key: 'a', eyebrow: 'Paso 1', label: 'Recibida', detail: 'Completada', state: 'done' },
              { key: 'b', eyebrow: 'Paso 2', label: 'Asignada', detail: 'Actual', state: 'current' },
            ]}
          />
          <Avatar name="Laura Méndez" />
          <Checkbox label="Mantener la sesión iniciada" />
          <RiskPill score={80} />
        </SectionCard>
        <Pagination page={1} size={10} total={30} onPageChange={vi.fn()} />
      </main>,
    )

    await expectNoA11yViolations()
  })
})
