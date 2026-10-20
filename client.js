window.__ModuleLoader__.load({
  id: 'dsh-plan-progress-pill',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'plan-progress-pill'
    const STORAGE_KEY = 'dsh-plan-progress-pill:collapsed'

    const DICT = {
      zh: {
        title: '计划进度',
        collapse: '收起计划',
        expand: '展开计划',
        done: '已完成',
        allDone: '全部完成',
      },
      en: {
        title: 'Plan progress',
        collapse: 'Collapse plan',
        expand: 'Expand plan',
        done: 'Completed',
        allDone: 'All done',
      },
    }

    /* ------------------------------------------------------------------ */
    /* Small observable helpers                                            */
    /* ------------------------------------------------------------------ */

    function useObservable(source) {
      const subscribe = React.useCallback((listener) => {
        if (!source || typeof source.subscribe !== 'function') return () => {}
        return source.subscribe(listener)
      }, [source])
      const getSnapshot = React.useCallback(() => {
        if (!source || typeof source.getSnapshot !== 'function') return undefined
        try {
          return source.getSnapshot()
        } catch {
          return undefined
        }
      }, [source])
      return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    }

    function readLocaleName(service) {
      try {
        if (!service || typeof service.getSnapshot !== 'function') return ''
        const snapshot = service.getSnapshot()
        if (typeof snapshot === 'string') return snapshot
        if (snapshot && typeof snapshot === 'object') {
          const candidate = snapshot.locale ?? snapshot.id ?? snapshot.lang ?? snapshot.name
          if (typeof candidate === 'string') return candidate
        }
      } catch {
        /* locale service unavailable on this page */
      }
      return ''
    }

    function useLocaleName(service) {
      const [name, setName] = React.useState(() => readLocaleName(service))
      React.useEffect(() => {
        setName(readLocaleName(service))
        if (!service || typeof service.subscribe !== 'function') return undefined
        const update = () => setName(readLocaleName(service))
        const dispose = service.subscribe(update)
        return typeof dispose === 'function' ? dispose : undefined
      }, [service])
      return name
    }

    function pickLanguage(name) {
      const value = String(name || '')
      if (value === '') {
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
            return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
          }
        } catch {
          /* ignore */
        }
        return 'zh'
      }
      return value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    function readCollapsed() {
      try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY)
        if (stored === '0') return false
        return true
      } catch {
        return true
      }
    }

    function useCollapsed() {
      const [collapsed, setCollapsedState] = React.useState(readCollapsed)
      const setCollapsed = React.useCallback((next) => {
        setCollapsedState(next)
        try {
          window.sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0')
        } catch {
          /* ignore quota/privacy errors */
        }
      }, [])
      return [collapsed, setCollapsed]
    }

    /* ------------------------------------------------------------------ */
    /* Placement: sit below the session header, never on top of its       */
    /* title bar / tab row controls (the overlay previously overlapped    */
    /* the top-right toolbar buttons).                                    */
    /* ------------------------------------------------------------------ */

    /**
     * Top edge (viewport px) of the session content area. The overlay should
     * start below the shell header (title row + banner toolbar + tab row), so
     * it never covers the top-right controls again. The tab panel's top edge
     * is exactly the content start line; fall back to the tab row or banner.
     */
    function measureContentTop() {
      const usable = (rect) => {
        if (!rect || rect.height <= 0 || rect.width <= 0) return false
        if (rect.width < window.innerWidth * 0.4) return false
        if (rect.top < 0 || rect.top > window.innerHeight * 0.45) return false
        return true
      }
      try {
        let top = 0
        let bottom = 0
        for (const element of document.querySelectorAll('[role="tablist"]')) {
          const rect = element.getBoundingClientRect()
          if (!usable(rect)) continue
          if (rect.bottom > bottom) bottom = rect.bottom
        }
        if (bottom > 0) return bottom
        for (const element of document.querySelectorAll('[role="tabpanel"]')) {
          const rect = element.getBoundingClientRect()
          if (usable(rect) && (top === 0 || rect.top < top)) top = rect.top
        }
        if (top > 0) return top
        for (const selector of ['[role="banner"]', 'header']) {
          for (const element of document.querySelectorAll(selector)) {
            if (selector === 'header' && !(element.querySelector && element.querySelector('[role="tablist"]'))) continue
            const rect = element.getBoundingClientRect()
            if (!usable(rect)) continue
            if (rect.bottom > bottom) bottom = rect.bottom
          }
        }
        if (bottom > 0 && bottom < window.innerHeight * 0.6) return bottom
      } catch {
        /* DOM unavailable: keep the static fallback offset */
      }
      return 0
    }

    function useOverlayTop(fallback) {
      const [top, setTop] = React.useState(fallback)
      React.useEffect(() => {
        let observed = null
        let mutations = null
        let frame = 0
        let settled = false

        const update = () => {
          const boundary = measureContentTop()
          // A transient DOM state (view swap) may yield nothing; keep the last
          // known good offset instead of jumping back to the fallback value.
          if (!(boundary > 0)) return
          setTop(Math.round(boundary + 8))
          settled = true
          if (mutations) {
            mutations.disconnect()
            mutations = null
          }
        }
        const schedule = () => {
          if (frame) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            update()
          })
        }

        update()
        window.addEventListener('resize', schedule)
        try {
          if (typeof ResizeObserver === 'function') {
            observed = new ResizeObserver(schedule)
            for (const selector of ['[role="tabpanel"]', '[role="banner"]', '[role="tablist"]']) {
              const element = document.querySelector(selector)
              if (element) observed.observe(element)
            }
          }
        } catch {
          /* ResizeObserver unsupported: resize listener is enough */
        }
        try {
          // The session view may mount its header/tab panel after the
          // overlay's first render; watch the shell until they are on screen.
          if (!settled && typeof MutationObserver === 'function' && document.body) {
            mutations = new MutationObserver(() => {
              if (settled) return
              schedule()
            })
            mutations.observe(document.body, { childList: true, subtree: true })
          }
        } catch {
          /* MutationObserver unsupported: the retries below still apply */
        }
        const retries = [250, 700, 1500, 3000].map((delay) => window.setTimeout(schedule, delay))

        return () => {
          window.removeEventListener('resize', schedule)
          if (frame) window.cancelAnimationFrame(frame)
          if (observed) observed.disconnect()
          if (mutations) mutations.disconnect()
          for (const timer of retries) window.clearTimeout(timer)
        }
      }, [fallback])
      return top
    }

    /* ------------------------------------------------------------------ */
    /* Plan data: the current session `todos` projection                   */
    /* ------------------------------------------------------------------ */

    /**
     * Resolve the live `todos` projection face from a uiSession binding
     * snapshot. The snapshot materialized by `uiSession.adapter.current`
     * carries `keyedHooks.projection(key)` for the current session, which is
     * exactly `binding.session.projections.faceOf(key)`.
     */
    function resolveTodosFace(binding) {
      if (!binding || typeof binding !== 'object' || binding.key === undefined) return undefined
      const keyed = binding.keyedHooks
      if (!keyed || typeof keyed.projection !== 'function') return undefined
      try {
        const face = keyed.projection('todos')
        if (face && typeof face.getSnapshot === 'function') return face
      } catch {
        /* projection registry not ready for this session */
      }
      return undefined
    }

    function useTodos(binding) {
      const [todos, setTodos] = React.useState(undefined)
      React.useEffect(() => {
        const face = resolveTodosFace(binding)
        if (!face) {
          setTodos(undefined)
          return undefined
        }
        const update = () => {
          try {
            setTodos(face.getSnapshot())
          } catch {
            setTodos(undefined)
          }
        }
        update()
        if (typeof face.subscribe === 'function') {
          const dispose = face.subscribe(update)
          if (typeof dispose === 'function') return dispose
        }
        return undefined
      }, [binding])
      return todos
    }

    /* ------------------------------------------------------------------ */
    /* Presentational pieces                                               */
    /* ------------------------------------------------------------------ */

    function ProgressRing({ done, total, size = 15, stroke = 2.2 }) {
      const radius = (size - stroke) / 2
      const circumference = 2 * Math.PI * radius
      const ratio = total > 0 ? Math.min(1, done / total) : 0
      const center = size / 2
      return h(
        'svg',
        {
          className: 'dsh-ppp-ring',
          width: size,
          height: size,
          viewBox: '0 0 ' + size + ' ' + size,
          'aria-hidden': 'true',
          style: { flex: 'none', display: 'block' },
        },
        h('circle', {
          cx: center,
          cy: center,
          r: radius,
          fill: 'none',
          stroke: 'var(--dsw-alias-border-l4, rgba(255,255,255,0.18))',
          strokeWidth: stroke,
        }),
        ratio > 0
          ? h('circle', {
              cx: center,
              cy: center,
              r: radius,
              fill: 'none',
              stroke: 'var(--dsw-alias-state-success-primary, #34d399)',
              strokeWidth: stroke,
              strokeLinecap: 'round',
              strokeDasharray: circumference.toFixed(2),
              strokeDashoffset: (circumference * (1 - ratio)).toFixed(2),
              transform: 'rotate(-90 ' + center + ' ' + center + ')',
            })
          : null,
      )
    }

    function Chevron({ dir }) {
      const path = dir === 'up' ? 'M3 7.4 6 4.4 9 7.4' : 'M3 4.6 6 7.6 9 4.6'
      return h(
        'span',
        { className: 'dsh-ppp-chevron', 'aria-hidden': 'true' },
        h(
          'svg',
          { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' },
          h('path', {
            d: path,
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ),
      )
    }

    function StatusGlyph({ status }) {
      if (status === 'completed') {
        return h(
          'svg',
          { className: 'dsh-ppp-item-glyph', width: 14, height: 17, viewBox: '0 0 14 17', fill: 'none', 'aria-hidden': 'true' },
          h('path', {
            d: 'M2.6 8.7 5.4 11.5 11.4 4.7',
            stroke: 'var(--dsw-alias-state-success-primary, #34d399)',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        )
      }
      if (status === 'in_progress') {
        return h(
          'svg',
          { className: 'dsh-ppp-item-glyph dsh-ppp-spin', width: 14, height: 17, viewBox: '0 0 14 17', fill: 'none', 'aria-hidden': 'true' },
          h('circle', {
            cx: 7,
            cy: 8.5,
            r: 4.1,
            stroke: 'var(--dsw-alias-brand-primary, #4d8cff)',
            strokeWidth: 1.7,
            strokeDasharray: '8.5 4.2',
            strokeLinecap: 'round',
          }),
        )
      }
      return h(
        'svg',
        { className: 'dsh-ppp-item-glyph', width: 14, height: 17, viewBox: '0 0 14 17', fill: 'none', 'aria-hidden': 'true' },
        h('circle', {
          cx: 7,
          cy: 8.5,
          r: 4.1,
          stroke: 'var(--dsw-alias-border-l4, rgba(255,255,255,0.32))',
          strokeWidth: 1.5,
          strokeDasharray: '2.2 2.6',
        }),
      )
    }

    /* ------------------------------------------------------------------ */
    /* The capsule                                                         */
    /* ------------------------------------------------------------------ */

    const STYLES = [
      '.dsh-ppp-root{position:fixed;top:var(--dsh-ppp-top,128px);right:14px;z-index:60;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-end;font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);color:var(--dsw-alias-label-primary,#e8e8e8);transition:top 140ms ease}',
      '.dsh-ppp-pill{display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;max-width:min(380px,calc(100vw - 24px));height:32px;padding:0 10px 0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-3,#262626);box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.35));color:var(--dsw-alias-label-primary,#e8e8e8);font:var(--dsw-font-xxs-12,12px/16px -apple-system,"Segoe UI",sans-serif);cursor:pointer;user-select:none;transition:border-color 120ms ease,background 120ms ease,transform 120ms ease}',
      '.dsh-ppp-pill:hover{border-color:var(--dsw-alias-border-l4,rgba(255,255,255,.24));background:var(--dsw-alias-bg-layer-2,#2e2e2e)}',
      '.dsh-ppp-pill:active{transform:scale(.985)}',
      '.dsh-ppp-pill--done{border-color:var(--dsw-alias-border-l4,rgba(255,255,255,.22));border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#34d399) 45%,transparent)}',
      '.dsh-ppp-pill-text{display:inline-flex;align-items:baseline;gap:8px;min-width:0}',
      '.dsh-ppp-pill-count{font:var(--dsw-font-xxs-strong-12,600 12px/16px -apple-system,"Segoe UI",sans-serif);letter-spacing:.01em;white-space:nowrap}',
      '.dsh-ppp-pill-active{color:var(--dsw-alias-label-tertiary,#a3a3a3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}',
      '.dsh-ppp-chevron{color:var(--dsw-alias-label-tertiary,#a3a3a3);display:inline-flex;margin-left:2px}',
      '.dsh-ppp-card{width:min(340px,calc(100vw - 24px));box-sizing:border-box;border-radius:var(--dsw-radius-lg,14px);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-3,#262626);box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(0,0,0,.45));overflow:hidden;animation:dsh-ppp-in 140ms ease-out}',
      '@keyframes dsh-ppp-in{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:none}}',
      '.dsh-ppp-head{display:flex;align-items:center;gap:10px;padding:10px 10px 8px 12px}',
      '.dsh-ppp-head-text{flex:1;min-width:0}',
      '.dsh-ppp-title{font:var(--dsw-font-xs-strong-13,600 13px/18px -apple-system,"Segoe UI",sans-serif);color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.dsh-ppp-sub{margin-top:1px;font:var(--dsw-font-xxxs-11,11px/15px -apple-system,"Segoe UI",sans-serif);color:var(--dsw-alias-label-tertiary,#a3a3a3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-ppp-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#a3a3a3);cursor:pointer;flex:none}',
      '.dsh-ppp-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.dsh-ppp-bar{height:3px;margin:0 12px;border-radius:999px;background:var(--dsw-alias-border-l3,rgba(255,255,255,.1));overflow:hidden}',
      '.dsh-ppp-bar-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-state-success-primary,#34d399);transition:width 220ms ease}',
      '.dsh-ppp-list{list-style:none;margin:8px 0 0;padding:4px 6px 6px;max-height:min(46vh,360px);overflow-y:auto}',
      '.dsh-ppp-item{display:flex;align-items:flex-start;gap:8px;padding:5px 6px;border-radius:8px;font:var(--dsw-font-xxs-12,12px/17px -apple-system,"Segoe UI",sans-serif);color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.dsh-ppp-item--in_progress{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.dsh-ppp-item--completed{color:var(--dsw-alias-label-tertiary,#a3a3a3)}',
      '.dsh-ppp-item-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center}',
      '.dsh-ppp-item-text{min-width:0;word-break:break-word}',
      '.dsh-ppp-item--completed .dsh-ppp-item-text{text-decoration:line-through;text-decoration-color:var(--dsw-alias-border-l4,rgba(255,255,255,.3))}',
      '.dsh-ppp-spin{animation:dsh-ppp-rotate 1s linear infinite}',
      '@keyframes dsh-ppp-rotate{to{transform:rotate(360deg)}}',
      '@media (max-width:720px){.dsh-ppp-root{top:auto;bottom:88px;right:12px}}',
    ].join('\n')

    function PlanProgressPill(props) {
      const binding = useObservable(props.current)
      const todos = useTodos(binding)
      const localeName = useLocaleName(props.locale)
      const t = DICT[pickLanguage(localeName)]
      const [collapsed, setCollapsed] = useCollapsed()
      const top = useOverlayTop(150)

      const list = Array.isArray(todos) ? todos.filter((item) => item && typeof item.content === 'string') : []
      const total = list.length
      const done = list.filter((item) => item.status === 'completed').length
      const active = list.find((item) => item.status === 'in_progress')
      const percent = total > 0 ? Math.round((done / total) * 100) : 0
      const complete = total > 0 && done === total

      if (total === 0) return null

      const styleElement = h('style', { key: 'dsh-ppp-style' }, STYLES)
      const rootProps = {
        className: 'dsh-ppp-root',
        'data-dsh-plan-progress-pill': '',
        style: { '--dsh-ppp-top': top + 'px' },
      }

      if (collapsed) {
        return h(
          React.Fragment,
          null,
          styleElement,
          h(
            'div',
            rootProps,
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-ppp-pill' + (complete ? ' dsh-ppp-pill--done' : ''),
                onClick: () => setCollapsed(false),
                title: t.expand,
                'aria-label': t.expand + ' (' + done + '/' + total + ')',
                'aria-expanded': false,
              },
              h(ProgressRing, { done, total }),
              h(
                'span',
                { className: 'dsh-ppp-pill-text' },
                h('span', { className: 'dsh-ppp-pill-count' }, complete ? t.allDone + ' ' + done + '/' + total : done + '/' + total),
                active ? h('span', { className: 'dsh-ppp-pill-active' }, active.content) : null,
              ),
              h(Chevron, { dir: 'down' }),
            ),
          ),
        )
      }

      return h(
        React.Fragment,
        null,
        styleElement,
        h(
          'div',
          rootProps,
          h(
            'section',
            { className: 'dsh-ppp-card', 'aria-label': t.title },
            h(
              'header',
              { className: 'dsh-ppp-head' },
              h(ProgressRing, { done, total, size: 16, stroke: 2.4 }),
              h(
                'div',
                { className: 'dsh-ppp-head-text' },
                h('div', { className: 'dsh-ppp-title' }, t.title),
                h(
                  'div',
                  { className: 'dsh-ppp-sub' },
                  complete ? t.done + ' ' + done + ' / ' + total + ' · ' + t.allDone : t.done + ' ' + done + ' / ' + total + ' · ' + percent + '%',
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ppp-icon-btn',
                  onClick: () => setCollapsed(true),
                  title: t.collapse,
                  'aria-label': t.collapse,
                },
                h(Chevron, { dir: 'up' }),
              ),
            ),
            h('div', { className: 'dsh-ppp-bar' }, h('div', { className: 'dsh-ppp-bar-fill', style: { width: percent + '%' } })),
            h(
              'ul',
              { className: 'dsh-ppp-list' },
              list.map((item, index) =>
                h(
                  'li',
                  { key: index, className: 'dsh-ppp-item dsh-ppp-item--' + (item.status || 'pending') },
                  h(StatusGlyph, { status: item.status }),
                  h('span', { className: 'dsh-ppp-item-text' }, item.content),
                ),
              ),
            ),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Plugin wiring                                                       */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale', 'uiSession'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-plan-progress-pill: locale dictionaries')
        const current = ctx.uiSession.adapter.current
        const locale = ctx.locale
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-plan-progress-pill',
              order: 25,
              locale: NS,
              inject: () => ({ current, locale }),
            },
            PlanProgressPill,
          ),
        )
      },
    }
  },
})
