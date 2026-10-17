import { useCallback, useState } from 'react'

// The app's own stand-in for window.confirm(): `await confirm({...})`
// resolves true or false, so a call site reads the same as it did with the
// browser's dialog, but what opens is ConfirmSheet — themed, in the design
// system, and not a system popup in the middle of an installed app.
//
//   const { confirm, sheetProps } = useConfirm()
//   if (!(await confirm({ title: 'Delete "Lunch"?', body: '…', confirmLabel: 'Delete' }))) return
//   …
//   {sheetProps && <ConfirmSheet {...sheetProps} />}
//
// `isConfirming` lets a page pause its own Escape handling while the sheet
// is up, so Escape only cancels the sheet. Asking again while a sheet is
// already open answers the first one "no".
export function useConfirm() {
  const [request, setRequest] = useState(null)

  const confirm = useCallback(
    ({ title, body, confirmLabel, tone = 'danger' }) =>
      new Promise((resolve) => {
        setRequest((previous) => {
          previous?.resolve(false)
          return { title, body, confirmLabel, tone, resolve }
        })
      }),
    []
  )

  const answer = useCallback((value) => {
    setRequest((current) => {
      current?.resolve(value)
      return null
    })
  }, [])
  const onConfirm = useCallback(() => answer(true), [answer])
  const onCancel = useCallback(() => answer(false), [answer])

  const sheetProps = request && {
    title: request.title,
    body: request.body,
    confirmLabel: request.confirmLabel,
    tone: request.tone,
    onConfirm,
    onCancel,
  }
  return { confirm, sheetProps, isConfirming: request !== null }
}
