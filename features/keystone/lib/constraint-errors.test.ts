import assert from 'node:assert/strict'
import test from 'node:test'
import { GraphQLError } from 'graphql'
import { CONSTRAINT_MESSAGES, constraintRefusal, constraintGraphQLError } from './constraint-errors'
import { readFileSync } from 'node:fs'

test('every rule in the migration has a readable message', () => {
  const sql = readFileSync(new URL('../../../migrations/20261108120000_comedy_club_invariants/migration.sql', import.meta.url), 'utf8')
  const names = [...sql.matchAll(/(?:ADD CONSTRAINT|CREATE (?:UNIQUE INDEX|CONSTRAINT TRIGGER|TRIGGER)) "([^"]+)"/g)].map(m => m[1])
  assert(names.length >= 40)
  for (const name of names) assert(CONSTRAINT_MESSAGES[name], `${name} has no message`)
  for (const [name, rule] of Object.entries(CONSTRAINT_MESSAGES)) assert(names.includes(name), `${name} is not in the migration`)
})

test('a CHECK refusal is found in Keystone’s debug text and in the cause chain', () => {
  const keystone = new GraphQLError('Prisma error', { extensions: { code: 'KS_PRISMA_ERROR', debug: { message: 'new row for relation "PriceTier" violates check constraint "PriceTier_counts_valid"' } } })
  assert.equal(constraintRefusal(keystone)?.code, 'COMEDY_CAPACITY_EXCEEDED')
  const wrapped = new Error('boom'); (wrapped as any).cause = { message: 'violates check constraint "Payment_currency_code"' }
  assert.equal(constraintRefusal(wrapped)?.code, 'COMEDY_INVALID_CURRENCY')
})

test('a unique violation is named by index or by its fields', () => {
  assert.equal(constraintRefusal(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['show', 'email'] } }))?.code, 'COMEDY_DUPLICATE_WAITLIST')
  assert.equal(constraintRefusal(new Error('Unique constraint failed on the fields: (`check`)'))?.code, 'COMEDY_DUPLICATE_PAYMENT')
  assert.equal(constraintRefusal(new Error('Key (venue, lower(name))=(v1, main room) already exists.'))?.code, 'COMEDY_DUPLICATE_NAME')
})

test('unknown errors are left alone and the refusal keeps the path', () => {
  assert.equal(constraintRefusal(new Error('connection reset')), null)
  const out = constraintGraphQLError(new GraphQLError('Prisma error', { path: ['updateShow'] }), { code: 'COMEDY_INVALID_TIME_RANGE', message: 'm' })
  assert.deepEqual([out.message, out.extensions.code, out.path], ['m', 'COMEDY_INVALID_TIME_RANGE', ['updateShow']])
})
