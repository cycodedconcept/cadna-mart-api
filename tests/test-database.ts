export function assertTestDatabase(
  test: string | undefined,
  application: string | undefined,
): asserts test is string {
  if (!test) throw new Error('DATABASE_URL_TEST is required');
  const target = new URL(test);
  if (
    target.protocol !== 'mysql:' ||
    !decodeURIComponent(target.pathname).endsWith('_test')
  )
    throw new Error('Test database name must end in _test');
  if (application) {
    const source = new URL(application);
    if (source.pathname === target.pathname)
      throw new Error('Test and application database names must differ');
  }
}
