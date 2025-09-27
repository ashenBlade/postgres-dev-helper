import * as assert from 'assert';
import * as utils from '../../utils';
import * as constants from '../../constants';
import * as configfile from '../../pgconf';


suite('Unit', async function () {
    test('getStructNameFromType', function () {
        const data = [
            /* Scalar types */
            ['int', 'int'],
            ['Oid', 'Oid'],
            ['Relids', 'Relids'],
            
            /* Pointer types */
            ['int *', 'int'],
            ['Node *', 'Node'],
            ['RelOptInfo *', 'RelOptInfo'],
            ['List **', 'List'],
            
            /* Qualifiers */
            ['struct RangeTblEntry', 'RangeTblEntry'],
            ['const int', 'int'],
            ['const void *', 'void'],
            ['const volatile int', 'int'],
            ['const char *', 'char'],
            ['PGconn * volatile', 'PGconn'],
            
            /* Non-trivial identifiers */
            ['A_Const *', 'A_Const'],
            ['const FormData_pg_attribute *', 'FormData_pg_attribute'],
        ];
        
        for (const [type, expected] of data) {
            const actual = utils.getStructNameFromType(type);
            assert.equal(actual, expected, type);
        }
    });

    test('substituteStructName', function () {
        const data = [
            ['int', 'long', 'long'],
            ['const int', 'double', 'const double'],
            ['Node *', 'RelOptInfo', 'RelOptInfo *'],
            ['const Node *', 'RelOptInfo', 'const RelOptInfo *'],
            ['int', 'Node', 'Node'],
            ['Relids', 'Bitmapset *', 'Bitmapset *'],
            ['MemoryContext *', 'MemoryContextData *', 'MemoryContextData * *'],
        ];
        for (const [type, substitution, expected] of data) {
            const actual = utils.substituteStructName(type, substitution);
            assert.equal(actual, expected, `${type}: ${substitution}`);
        }
    });
    
    test('havePointersCount', function () {
        const data: [string, number, boolean][] = [
            ['int', 0, true],
            ['int', 1, false],

            ['int *', 0, false],
            ['int *', 1, true],
            ['int *', 2, false],
            
            ['struct RangeTblEntry *', 0, false],
            ['struct RangeTblEntry *', 1, true],
            ['struct RangeTblEntry *', 2, false],

            ['List **', 0, false],
            ['List **', 1, false],
            ['List **', 2, true],
            ['List **', 3, false],
        ];
        for (const [type, count, expected] of data) {
            const actual = utils.havePointersCount(type, count);
            assert.equal(actual, expected, `${type}: ${count}`);
        }
    });
    
    test('getParamsByPrefix', function() {
        type functionResult = [number, number] | number | undefined;
        type testData = [string[], string, functionResult];
        const _ = (arr: string[], input: string, idx: functionResult): testData => [arr, input, idx];
        const data: testData[] = [
            /* Simple binary search tests */
            _(['a', 'b', 'c'], 'a', 0),
            _(['a', 'b', 'c'], 'b', 1),
            _(['a', 'b', 'c'], 'c', 2),
            _(['a', 'b', 'c'], 'e', undefined),
            _(['b', 'c', 'd'], 'a', undefined),
            _(['a', 'aa', 'aaa'], 'a', [0, 3]),

            /* Prefix search */
            _(['abc', 'def', 'ghi'], 'ab', 0),
            _(['abc', 'def', 'ghi'], 'de', 1),
            _(['abc', 'def', 'ghi'], 'gh', 2),
            _(['abcd', 'abce', 'abcf'], 'ab', [0, 3]),
            _(['abcd', 'abce', 'abcf'], 'xx', undefined),
            
            /* Realistic input */
            ...[
                ['enable', undefined],
                ['jo', 1],
                ['lc_m', [4, 6]],
                ['lc_n', 6],
            ].map(([input, r]) => _([
                'jit_tuple_deforming',
                'join_collapse_limit',
                'krb_caseins_users',
                'krb_server_keyfile',
                'lc_messages',
                'lc_monetary',
                'lc_numeric',
            ], input as string, r as functionResult)),
            
            ...[
                ['b', [0, 6]],
                ['bg', [0, 3]],
                ['bon', [3, 5]],
                ['bonjour', [3, 5]],
                ['bonjour_', 4],
            ].map(([input, r]) => _([
                'bgwriter_flush_after',
                'bgwriter_lru_maxpages',
                'bgwriter_lru_multiplier',
                'bonjour',
                'bonjour_name',
                'bytea_output',
            ], input as string, r as functionResult)),
        ];
        for (const [array, prefix, expected] of data) {
            const actual = configfile.getParamsByPrefix(array, prefix);
            assert.deepStrictEqual(actual, expected, `${prefix} - ${array}`);
        }
        
        /* Some integration testing */
        const parameters = constants.getWellKnownConfigurationParameters();
        const check = (input: string) => {
            const range = configfile.getParamsByPrefix(parameters, input);
            assert.ok(Array.isArray(range));
            /* Use set, so we can add elements anytime */
            const expected = parameters.filter(p => p.startsWith(input));
            assert.deepStrictEqual(new Set(parameters.slice(...range)), new Set(expected));
        };
        
        check('pg_stat_sta');
        check('enabl');
        check('max_paral');
    });
});
