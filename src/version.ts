/**
 * The game's version, read from package.json (the one place it is set). Every release bumps it: a patch for
 * each release, a minor version for a milestone. See CHANGELOG.md.
 */
import { version } from '../package.json';

export const VERSION: string = version;

/** Release stage shown next to the version. */
export const STAGE = 'Beta';

/** "v0.2.0 Beta" */
export const VERSION_LABEL = `v${VERSION}${STAGE ? ` ${STAGE}` : ''}`;
