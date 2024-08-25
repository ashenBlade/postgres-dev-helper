export function getDefaultNodeTags(): string[] {
    /* PG17beta3, nodetags.h */
    return [
        /* Pseudo NodeTags */
        'Node',
        'Expr',
        
        'List',
        'Alias',
        'RangeVar',
        'TableFunc',
        'IntoClause',
        'Var',
        'Const',
        'Param',
        'Aggref',
        'GroupingFunc',
        'WindowFunc',
        'WindowFuncRunCondition',
        'MergeSupportFunc',
        'SubscriptingRef',
        'FuncExpr',
        'NamedArgExpr',
        'OpExpr',
        'DistinctExpr',
        'NullIfExpr',
        'ScalarArrayOpExpr',
        'BoolExpr',
        'SubLink',
        'SubPlan',
        'AlternativeSubPlan',
        'FieldSelect',
        'FieldStore',
        'RelabelType',
        'CoerceViaIO',
        'ArrayCoerceExpr',
        'ConvertRowtypeExpr',
        'CollateExpr',
        'CaseExpr',
        'CaseWhen',
        'CaseTestExpr',
        'ArrayExpr',
        'RowExpr',
        'RowCompareExpr',
        'CoalesceExpr',
        'MinMaxExpr',
        'SQLValueFunction',
        'XmlExpr',
        'JsonFormat',
        'JsonReturning',
        'JsonValueExpr',
        'JsonConstructorExpr',
        'JsonIsPredicate',
        'JsonBehavior',
        'JsonExpr',
        'JsonTablePath',
        'JsonTablePathScan',
        'JsonTableSiblingJoin',
        'NullTest',
        'BooleanTest',
        'MergeAction',
        'CoerceToDomain',
        'CoerceToDomainValue',
        'SetToDefault',
        'CurrentOfExpr',
        'NextValueExpr',
        'InferenceElem',
        'TargetEntry',
        'RangeTblRef',
        'JoinExpr',
        'FromExpr',
        'OnConflictExpr',
        'Query',
        'TypeName',
        'ColumnRef',
        'ParamRef',
        'A_Expr',
        'A_Const',
        'TypeCast',
        'CollateClause',
        'RoleSpec',
        'FuncCall',
        'A_Star',
        'A_Indices',
        'A_Indirection',
        'A_ArrayExpr',
        'ResTarget',
        'MultiAssignRef',
        'SortBy',
        'WindowDef',
        'RangeSubselect',
        'RangeFunction',
        'RangeTableFunc',
        'RangeTableFuncCol',
        'RangeTableSample',
        'ColumnDef',
        'TableLikeClause',
        'IndexElem',
        'DefElem',
        'LockingClause',
        'XmlSerialize',
        'PartitionElem',
        'PartitionSpec',
        'PartitionBoundSpec',
        'PartitionRangeDatum',
        'SinglePartitionSpec',
        'PartitionCmd',
        'RangeTblEntry',
        'RTEPermissionInfo',
        'RangeTblFunction',
        'TableSampleClause',
        'WithCheckOption',
        'SortGroupClause',
        'GroupingSet',
        'WindowClause',
        'RowMarkClause',
        'WithClause',
        'InferClause',
        'OnConflictClause',
        'CTESearchClause',
        'CTECycleClause',
        'CommonTableExpr',
        'MergeWhenClause',
        'TriggerTransition',
        'JsonOutput',
        'JsonArgument',
        'JsonFuncExpr',
        'JsonTablePathSpec',
        'JsonTable',
        'JsonTableColumn',
        'JsonKeyValue',
        'JsonParseExpr',
        'JsonScalarExpr',
        'JsonSerializeExpr',
        'JsonObjectConstructor',
        'JsonArrayConstructor',
        'JsonArrayQueryConstructor',
        'JsonAggConstructor',
        'JsonObjectAgg',
        'JsonArrayAgg',
        'RawStmt',
        'InsertStmt',
        'DeleteStmt',
        'UpdateStmt',
        'MergeStmt',
        'SelectStmt',
        'SetOperationStmt',
        'ReturnStmt',
        'PLAssignStmt',
        'CreateSchemaStmt',
        'AlterTableStmt',
        'ReplicaIdentityStmt',
        'AlterTableCmd',
        'AlterCollationStmt',
        'AlterDomainStmt',
        'GrantStmt',
        'ObjectWithArgs',
        'AccessPriv',
        'GrantRoleStmt',
        'AlterDefaultPrivilegesStmt',
        'CopyStmt',
        'VariableSetStmt',
        'VariableShowStmt',
        'CreateStmt',
        'Constraint',
        'CreateTableSpaceStmt',
        'DropTableSpaceStmt',
        'AlterTableSpaceOptionsStmt',
        'AlterTableMoveAllStmt',
        'CreateExtensionStmt',
        'AlterExtensionStmt',
        'AlterExtensionContentsStmt',
        'CreateFdwStmt',
        'AlterFdwStmt',
        'CreateForeignServerStmt',
        'AlterForeignServerStmt',
        'CreateForeignTableStmt',
        'CreateUserMappingStmt',
        'AlterUserMappingStmt',
        'DropUserMappingStmt',
        'ImportForeignSchemaStmt',
        'CreatePolicyStmt',
        'AlterPolicyStmt',
        'CreateAmStmt',
        'CreateTrigStmt',
        'CreateEventTrigStmt',
        'AlterEventTrigStmt',
        'CreatePLangStmt',
        'CreateRoleStmt',
        'AlterRoleStmt',
        'AlterRoleSetStmt',
        'DropRoleStmt',
        'CreateSeqStmt',
        'AlterSeqStmt',
        'DefineStmt',
        'CreateDomainStmt',
        'CreateOpClassStmt',
        'CreateOpClassItem',
        'CreateOpFamilyStmt',
        'AlterOpFamilyStmt',
        'DropStmt',
        'TruncateStmt',
        'CommentStmt',
        'SecLabelStmt',
        'DeclareCursorStmt',
        'ClosePortalStmt',
        'FetchStmt',
        'IndexStmt',
        'CreateStatsStmt',
        'StatsElem',
        'AlterStatsStmt',
        'CreateFunctionStmt',
        'FunctionParameter',
        'AlterFunctionStmt',
        'DoStmt',
        'InlineCodeBlock',
        'CallStmt',
        'CallContext',
        'RenameStmt',
        'AlterObjectDependsStmt',
        'AlterObjectSchemaStmt',
        'AlterOwnerStmt',
        'AlterOperatorStmt',
        'AlterTypeStmt',
        'RuleStmt',
        'NotifyStmt',
        'ListenStmt',
        'UnlistenStmt',
        'TransactionStmt',
        'CompositeTypeStmt',
        'CreateEnumStmt',
        'CreateRangeStmt',
        'AlterEnumStmt',
        'ViewStmt',
        'LoadStmt',
        'CreatedbStmt',
        'AlterDatabaseStmt',
        'AlterDatabaseRefreshCollStmt',
        'AlterDatabaseSetStmt',
        'DropdbStmt',
        'AlterSystemStmt',
        'ClusterStmt',
        'VacuumStmt',
        'VacuumRelation',
        'ExplainStmt',
        'CreateTableAsStmt',
        'RefreshMatViewStmt',
        'CheckPointStmt',
        'DiscardStmt',
        'LockStmt',
        'ConstraintsSetStmt',
        'ReindexStmt',
        'CreateConversionStmt',
        'CreateCastStmt',
        'CreateTransformStmt',
        'PrepareStmt',
        'ExecuteStmt',
        'DeallocateStmt',
        'DropOwnedStmt',
        'ReassignOwnedStmt',
        'AlterTSDictionaryStmt',
        'AlterTSConfigurationStmt',
        'PublicationTable',
        'PublicationObjSpec',
        'CreatePublicationStmt',
        'AlterPublicationStmt',
        'CreateSubscriptionStmt',
        'AlterSubscriptionStmt',
        'DropSubscriptionStmt',
        'PlannerGlobal',
        'PlannerInfo',
        'RelOptInfo',
        'IndexOptInfo',
        'ForeignKeyOptInfo',
        'StatisticExtInfo',
        'JoinDomain',
        'EquivalenceClass',
        'EquivalenceMember',
        'PathKey',
        'GroupByOrdering',
        'PathTarget',
        'ParamPathInfo',
        'Path',
        'IndexPath',
        'IndexClause',
        'BitmapHeapPath',
        'BitmapAndPath',
        'BitmapOrPath',
        'TidPath',
        'TidRangePath',
        'SubqueryScanPath',
        'ForeignPath',
        'CustomPath',
        'AppendPath',
        'MergeAppendPath',
        'GroupResultPath',
        'MaterialPath',
        'MemoizePath',
        'UniquePath',
        'GatherPath',
        'GatherMergePath',
        'NestPath',
        'MergePath',
        'HashPath',
        'ProjectionPath',
        'ProjectSetPath',
        'SortPath',
        'IncrementalSortPath',
        'GroupPath',
        'UpperUniquePath',
        'AggPath',
        'GroupingSetData',
        'RollupData',
        'GroupingSetsPath',
        'MinMaxAggPath',
        'WindowAggPath',
        'SetOpPath',
        'RecursiveUnionPath',
        'LockRowsPath',
        'ModifyTablePath',
        'LimitPath',
        'RestrictInfo',
        'PlaceHolderVar',
        'SpecialJoinInfo',
        'OuterJoinClauseInfo',
        'AppendRelInfo',
        'RowIdentityVarInfo',
        'PlaceHolderInfo',
        'MinMaxAggInfo',
        'PlannerParamItem',
        'AggInfo',
        'AggTransInfo',
        'PlannedStmt',
        'Result',
        'ProjectSet',
        'ModifyTable',
        'Append',
        'MergeAppend',
        'RecursiveUnion',
        'BitmapAnd',
        'BitmapOr',
        'SeqScan',
        'SampleScan',
        'IndexScan',
        'IndexOnlyScan',
        'BitmapIndexScan',
        'BitmapHeapScan',
        'TidScan',
        'TidRangeScan',
        'SubqueryScan',
        'FunctionScan',
        'ValuesScan',
        'TableFuncScan',
        'CteScan',
        'NamedTuplestoreScan',
        'WorkTableScan',
        'ForeignScan',
        'CustomScan',
        'NestLoop',
        'NestLoopParam',
        'MergeJoin',
        'HashJoin',
        'Material',
        'Memoize',
        'Sort',
        'IncrementalSort',
        'Group',
        'Agg',
        'WindowAgg',
        'Unique',
        'Gather',
        'GatherMerge',
        'Hash',
        'SetOp',
        'LockRows',
        'Limit',
        'PlanRowMark',
        'PartitionPruneInfo',
        'PartitionedRelPruneInfo',
        'PartitionPruneStepOp',
        'PartitionPruneStepCombine',
        'PlanInvalItem',
        'ExprState',
        'IndexInfo',
        'ExprContext',
        'ReturnSetInfo',
        'ProjectionInfo',
        'JunkFilter',
        'OnConflictSetState',
        'MergeActionState',
        'ResultRelInfo',
        'EState',
        'WindowFuncExprState',
        'SetExprState',
        'SubPlanState',
        'DomainConstraintState',
        'ResultState',
        'ProjectSetState',
        'ModifyTableState',
        'AppendState',
        'MergeAppendState',
        'RecursiveUnionState',
        'BitmapAndState',
        'BitmapOrState',
        'ScanState',
        'SeqScanState',
        'SampleScanState',
        'IndexScanState',
        'IndexOnlyScanState',
        'BitmapIndexScanState',
        'BitmapHeapScanState',
        'TidScanState',
        'TidRangeScanState',
        'SubqueryScanState',
        'FunctionScanState',
        'ValuesScanState',
        'TableFuncScanState',
        'CteScanState',
        'NamedTuplestoreScanState',
        'WorkTableScanState',
        'ForeignScanState',
        'CustomScanState',
        'JoinState',
        'NestLoopState',
        'MergeJoinState',
        'HashJoinState',
        'MaterialState',
        'MemoizeState',
        'SortState',
        'IncrementalSortState',
        'GroupState',
        'AggState',
        'WindowAggState',
        'UniqueState',
        'GatherState',
        'GatherMergeState',
        'HashState',
        'SetOpState',
        'LockRowsState',
        'LimitState',
        'IndexAmRoutine',
        'TableAmRoutine',
        'TsmRoutine',
        'EventTriggerData',
        'TriggerData',
        'TupleTableSlot',
        'FdwRoutine',
        'Bitmapset',
        'ExtensibleNode',
        'ErrorSaveContext',
        'IdentifySystemCmd',
        'BaseBackupCmd',
        'CreateReplicationSlotCmd',
        'DropReplicationSlotCmd',
        'AlterReplicationSlotCmd',
        'StartReplicationCmd',
        'ReadReplicationSlotCmd',
        'TimeLineHistoryCmd',
        'UploadManifestCmd',
        'SupportRequestSimplify',
        'SupportRequestSelectivity',
        'SupportRequestCost',
        'SupportRequestRows',
        'SupportRequestIndexCondition',
        'SupportRequestWFuncMonotonic',
        'SupportRequestOptimizeWindowClause',
        'Integer',
        'Float',
        'Boolean',
        'String',
        'BitString',
        'ForeignKeyCacheInfo',
        'IntList',
        'OidList',
        'XidList',
        'AllocSetContext',
        'GenerationContext',
        'SlabContext',
        'BumpContext',
        'TIDBitmap',
        'WindowObjectData',
    ]
}

export interface Alias {
    alias: string;
    type: string;
}
export function getDefaultAliases(): Alias[] {
    return [
        {
            alias: 'Relids',
            type: 'Bitmapset *'
        }
    ]
}

export interface ArraySpecialMember {
    typeName: string;
    memberName: string;
    lengthExpr: string
}

export function getArraySpecialMembers(): ArraySpecialMember[] {
    const _ = (typeName: string, memberName: string, lengthExpr: string) => ({ typeName, memberName, lengthExpr });

    return [
        _('PlannerInfo', 'simple_rel_array', 'simple_rel_array_size'),
        _('PlannerInfo', 'simple_rte_array', 'simple_rel_array_size'),
        _('PlannerInfo', 'append_rel_array', 'simple_rel_array_size'),
        _('PlannerInfo', 'placeholder_array', 'placeholder_array_size'),

        _('ResultRelInfo', 'ri_IndexRelationInfo', 'ri_NumIndices'),
        _('ResultRelInfo', 'ri_TrigWhenExprs', 'ri_TrigDesc->numtriggers'),
        _('ResultRelInfo', 'ri_Slots', 'ri_NumSlots'),
        _('ResultRelInfo', 'ri_PlanSlots', 'ri_NumSlots'),
        _('ResultRelInfo', 'ri_ConstraintExprs', 'ri_RelationDesc->rd_att->natts'),
        _('ResultRelInfo', 'ri_GeneratedExprsI', 'ri_NumGeneratedNeededI'),
        _('ResultRelInfo', 'ri_GeneratedExprsU', 'ri_NumGeneratedNeededU'),

        _('EState', 'es_rowmarks', 'es_range_table_size'),
        _('EState', 'es_result_relations', 'es_range_table_size'),

        _('EPQState', 'relsubs_slot', 'parentestate->es_range_table_size'),
        _('EPQState', 'relsubs_rowmark', 'parentestate->es_range_table_size'),

        _('ProjectSetState', 'elems', 'nelems'),

        _('AppendState', 'appendplans', 'as_nplans'),
        _('AppendState', 'as_asyncrequests', 'as_nplans'),
        _('AppendState', 'as_asyncresults', 'as_nasyncresults'),

        _('MergeAppendState', 'mergeplans', 'ms_nplans'),
        _('MergeAppendState', 'ms_slots', 'ms_nplans'),

        _('BitmapAndState', 'bitmapplans', 'nplans'),

        _('BitmapOrState', 'bitmapplans', 'nplans'),

        _('ValuesScanState', 'exprlists', 'array_len'),
        _('ValuesScanState', 'exprstatelists', 'array_len'),

        _('MemoizeState', 'param_exprs', 'nkeys'),

        _('AggState', 'aggcontexts', 'maxsets'),

        _('GatherState', 'reader', 'nreaders'),

        _('GatherMergeState', 'gm_slots', 'nreaders + 1'),
        _('GatherMergeState', 'reader', 'nreaders'),

        _('RelOptInfo', 'part_rels', 'nparts'),
        _('RelOptInfo', 'partexprs', 'part_scheme->partnatts'),
        _('RelOptInfo', 'nullable_partexprs', 'part_scheme->partnatts'),

        _('IndexOptInfo', 'indexkeys', 'ncolumns'),
        _('IndexOptInfo', 'indexcollations', 'ncolumns'),
        _('IndexOptInfo', 'opfamily', 'ncolumns'),
        _('IndexOptInfo', 'opcintype', 'ncolumns'),
        _('IndexOptInfo', 'sortopfamily', 'ncolumns'),
        _('IndexOptInfo', 'reverse_sort', 'ncolumns'),
        _('IndexOptInfo', 'nulls_first', 'ncolumns'),
        _('IndexOptInfo', 'canreturn', 'ncolumns'),

        _('ForeignKeyOptInfo', 'conkey', 'nkeys'),
        _('ForeignKeyOptInfo', 'confkey', 'nkeys'),
        _('ForeignKeyOptInfo', 'conpfeqop', 'nkeys'),

        _('ForeignKeyCacheInfo', 'conkey', 'nkeys'),
        _('ForeignKeyCacheInfo', 'confkey', 'nkeys'),
        _('ForeignKeyCacheInfo', 'conpfeqop', 'nkeys'),

        _('PathTarget', 'sortgrouprefs', 'exprs'),

        _('AppendRelInfo', 'parent_colnos', 'num_child_cols'),

        _('MergeAppend', 'sortColIdx', 'numCols'),
        _('MergeAppend', 'sortOperators', 'numCols'),
        _('MergeAppend', 'collations', 'numCols'),
        _('MergeAppend', 'nullsFirst', 'numCols'),

        _('RecursiveUnion', 'dupColIdx', 'numCols'),
        _('RecursiveUnion', 'dupOperators', 'numCols'),
        _('RecursiveUnion', 'dupCollations', 'numCols'),

        _('MergeJoin', 'mergeFamilies', 'mergeclauses'),
        _('MergeJoin', 'mergeCollations', 'mergeclauses'),
        _('MergeJoin', 'mergeStrategies', 'mergeclauses'),
        _('MergeJoin', 'mergeNullsFirst', 'mergeclauses'),

        _('Memoize', 'hashOperators', 'numKeys'),
        _('Memoize', 'collations', 'numKeys'),
        
        _('Sort', 'sortColIdx', 'numCols'),
        _('Sort', 'sortOperators', 'numCols'),
        _('Sort', 'collations', 'numCols'),
        _('Sort', 'nullsFirst', 'numCols'),

        _('Group', 'grpColIdx', 'numCols'),
        _('Group', 'grpOperators', 'numCols'),
        _('Group', 'grpCollations', 'numCols'),

        _('Agg', 'grpColIdx', 'numCols'),
        _('Agg', 'grpOperators', 'numCols'),
        _('Agg', 'grpCollations', 'numCols'),

        _('WindowAgg', 'partColIdx', 'partNumCols'),
        _('WindowAgg', 'partOperators', 'partNumCols'),
        _('WindowAgg', 'partCollations', 'partNumCols'),
        _('WindowAgg', 'ordColIdx', 'ordNumCols'),
        _('WindowAgg', 'ordOperators', 'ordNumCols'),
        _('WindowAgg', 'ordCollations', 'ordNumCols'),

        _('Unique', 'uniqColIdx', 'numCols'),
        _('Unique', 'uniqOperators', 'numCols'),
        _('Unique', 'uniqCollations', 'numCols'),

        _('GatherMerge', 'sortColIdx', 'numCols'),
        _('GatherMerge', 'sortOperators', 'numCols'),
        _('GatherMerge', 'collations', 'numCols'),
        _('GatherMerge', 'nullsFirst', 'numCols'),

        _('SetOp', 'dupColIdx', 'numCols'),
        _('SetOp', 'dupOperators', 'numCols'),
        _('SetOp', 'dupCollations', 'numCols'),

        _('Limit', 'uniqColIdx', 'uniqNumCols'),
        _('Limit', 'uniqOperators', 'uniqNumCols'),
        _('Limit', 'uniqCollations', 'uniqNumCols'),

        _('PartitionedRelPruneInfo', 'subplan_map', 'nparts'),
        _('PartitionedRelPruneInfo', 'subpart_map', 'nparts'),
        _('PartitionedRelPruneInfo', 'relid_map', 'nparts'), 
        
        _('PLpgSQL_row', 'fieldnames', 'nfields'),
        _('PLpgSQL_stmt_block', 'initvarnoss', 'n_initvars'),
        _('PLpgSQL_function', 'datums', 'ndatums'),
        _('PLpgSQL_execstate', 'datums', 'ndatums'),

        _('GISTBuildBuffers', 'buffersOnLevels', 'buffersOnLevelsLen'),
        _('GISTBuildBuffers', 'loadedBuffers', 'loadedBuffersCount'),

        _('TableInfo', 'parents', 'numParents'),
        _('TableInfo', 'attnames', 'numatts'),
        _('TableInfo', 'atttypnames', 'numatts'),
        _('TableInfo', 'attstattarget', 'numatts'),
        _('TableInfo', 'attstorage', 'numatts'),
        _('TableInfo', 'typstorage', 'numatts'),
        _('TableInfo', 'attisdropped', 'numatts'),
        _('TableInfo', 'attidentity', 'numatts'),
        _('TableInfo', 'attlen', 'numatts'),
        _('TableInfo', 'attalign', 'numatts'),
        _('TableInfo', 'attislocal', 'numatts'),
        _('TableInfo', 'attoptions', 'numatts'),
        _('TableInfo', 'attcollation', 'numatts'),
        _('TableInfo', 'attcompression', 'numatts'),
        _('TableInfo', 'attfdwoptions', 'numatts'),
        _('TableInfo', 'attmissingval', 'numatts'),
        _('TableInfo', 'notnull', 'numatts'),
        _('TableInfo', 'inhNotNull', 'numatts'),
        _('TableInfo', 'attrdefs', 'numatts'),
        _('TableInfo', 'checkexprs', 'numatts'),

        _('IndxInfo', 'indkeys', 'indnattrs'),
        _('OSInfo', 'old_tablespaces', 'num_old_tablespaces'),
        _('OSInfo', 'libraries', 'num_libraries'),

        _('ParallelExecutorInfo', 'reader', 'pcxt->nworkers_launched'),
        _('ParallelExecutorInfo', 'tqueue', 'pcxt->nworkers_launched'),

        _('SQLFunctionParseInfo', 'argnames', 'nargs'),
        _('SQLFunctionParseInfo', 'argnames', 'nargs'),

        _('HashJoinTableData', 'skewBucket', 'nSkewBuckets'),
        _('HashJoinTableData', 'skewBucketNums', 'nSkewBuckets'),

        _('AggStatePerPhaseData', 'grouped_cols', 'numsets'),
        _('AggStatePerPhaseData', 'eqfunctions', 'numsets'),

        _('printTableContent', 'headers', 'ncolumns + 1'),
        _('printTableContent', 'aligns', 'ncolumns + 1'),

        _('printQueryOpt', 'translate_columns', 'n_translate_columns'),

        _('WindowFuncLists', 'windowFuncs', 'numWindowFuncs'),

        _('PartitionBoundInfoData', 'datums', 'ndatums'),
        _('PartitionBoundInfoData', 'kind', 'ndatums'),
        _('PartitionBoundInfoData', 'indexes', 'nindexes'),

        _('LogicalRepRelation', 'attnames', 'natts'),
        _('LogicalRepRelation', 'atttyps', 'natts'),

        _('LogicalRepTupleData', 'colvalues', 'ncols'),
        _('LogicalRepTupleData', 'colstatus', 'ncols'),

        _('RuleLock', 'rules', 'numLocks'),

        _('StatsBuildData', 'attnums', 'nattnums'),
        _('StatsBuildData', 'stats', 'nattnums'),

        _('RelationData', 'rd_opfamily', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_opcintype', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_indcollation', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_indoption', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_exclops', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_exclprocs', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_exclstrats', 'rd_index->indnkeyatts'),

        _('statement', 'paramvalues', 'nparams + 1'),
        _('statement', 'paramlengths', 'nparams + 1'),
        _('statement', 'paramformats', 'nparams + 1'),

        _('pg_result', 'tuples', 'ntups'),
        _('pg_result', 'attDescs', 'numAttributes'),
        _('pg_result', 'paramDescs', 'numParameters'),
        _('pg_result', 'events', 'nEvents'),

        _('pg_conn', 'events', 'nEvents'),
        _('pg_conn', 'addr', 'naddr'),

        _('PLyProcedure', 'args', 'nargs'),
        _('PLyProcedure', 'argnames', 'nargs'),

        _('PLySavedArgs', 'namedargs', 'nargs'),

        _('Session', 'steps', 'nsteps'),

        _('PermutationStepBlocker', 'blockers', 'nblockers'),

        _('Permutation', 'steps', 'nsteps'),

        _('TestSpec', 'setupsqls', 'nsetupsqls'),
        _('TestSpec', 'sessions', 'nsesssions'),
        _('TestSpec', 'permutations', 'npermutations'),        
    ];
}