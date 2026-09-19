import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Unmounts whatever the previous component test rendered into jsdom's
// document — without this, each test file's later tests would find every
// earlier test's leftover DOM still attached, since jsdom (unlike a real
// browser tab) doesn't get torn down between tests on its own.
afterEach(cleanup)
