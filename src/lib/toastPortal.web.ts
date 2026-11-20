import React from 'react'

type CreatePortalFn = (children: React.ReactNode, container: Element) => React.ReactNode

export function renderToastOverlay(node: React.ReactNode): React.ReactNode {
    if (typeof document !== 'undefined' && document.body) {
        const { createPortal } = require('react-dom') as { createPortal: CreatePortalFn }
        return createPortal(node, document.body)
    }
    return node
}
