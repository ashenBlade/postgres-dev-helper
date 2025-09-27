import * as assert from 'assert';
import * as utils from '../../utils';


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
});
