import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    /* Bootstrap Mocha */
	const mocha = new Mocha({
		ui: 'tdd',
        /* Set big value for timeout, due to lots of IO */
        timeout: '1m',
        /* DAP does (may) not support parallel request execution */
        parallel: false,
	});
	const testsRoot = path.resolve(__dirname, '..');

	return new Promise(async (c, e) => {
        try {
            /* Collect all test files */
            const testFiles = await glob.glob('**/**.test.js', { cwd: testsRoot });
            testFiles.forEach(f => mocha.addFile(path.join(testsRoot, f)))

            /* Run tests */
            mocha.run(failures => {
                if (0 < failures) {
                    e(new Error(`${failures} tests failed.`));
                } else {
                    c();
                }
            });
        } catch (err) {
            e(err);
        }
	});
}