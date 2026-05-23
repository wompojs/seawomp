/* Loader for a single blog post. In a real app this would hit a database/API; the fixture just
 * builds a deterministic body from the URL param so the e2e tests can assert on it. */
import type { LoaderArgs } from 'seawomp';

export async function loader({ params }: LoaderArgs<{ id: string }>) {
	return {
		body: `This is the body for post #${params.id}.`,
	};
}
