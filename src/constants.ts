export function getDefaultNodeTags(): string[] {
    /* Compiled from versions from 8.0 to 17 */
    return [
        /* 
         * Pseudo NodeTags.
         * They are abstract Nodes that do not
         * have own NodeTag, but they must be
         * handled as `Node' - get real NodeTag
         */
        'Node',
        'Expr',
        'Plan',
        'MemoryContextData',

        'A_ArrayExpr',
        'AccessPriv',
        'A_Const',
        'A_Expr',
        'Agg',
        'AggInfo',
        'AggPath',
        'Aggref',
        'AggrefExprState',
        'AGGSPLIFINAL_DESERIAL',
        'AGGSPLIINITIAL_SERIAL',
        'AGGSPLISIMPLE',
        'AggState',
        'AggTransInfo',
        'A_Indices',
        'A_Indirection',
        'Alias',
        'AllocSetContext',
        'AlterCollationStmt',
        'AlterDatabaseRefreshCollStmt',
        'AlterDatabaseSetStmt',
        'AlterDatabaseStmt',
        'AlterDefaultPrivilegesStmt',
        'AlterDomainStmt',
        'AlterEnumStmt',
        'AlterEventTrigStmt',
        'AlterExtensionContentsStmt',
        'AlterExtensionStmt',
        'AlterFdwStmt',
        'AlterForeignServerStmt',
        'AlterFunctionStmt',
        'AlterGroupStmt',
        'AlternativeSubPlan',
        'AlternativeSubPlanState',
        'AlterObjectDependsStmt',
        'AlterObjectSchemaStmt',
        'AlterOperatorStmt',
        'AlterOpFamilyStmt',
        'AlterOwnerStmt',
        'AlterPolicyStmt',
        'AlterPublicationStmt',
        'AlterReplicationSlotCmd',
        'AlterRoleSetStmt',
        'AlterRoleStmt',
        'AlterSeqStmt',
        'AlterStatsStmt',
        'AlterSubscriptionStmt',
        'AlterSystemStmt',
        'AlterTableCmd',
        'AlterTableMoveAllStmt',
        'AlterTableSpaceOptionsStmt',
        'AlterTableStmt',
        'AlterTSConfigurationStmt',
        'AlterTSDictionaryStmt',
        'AlterTypeStmt',
        'AlterUserMappingStmt',
        'AlterUserSetStmt',
        'AlterUserStmt',
        'Append',
        'AppendPath',
        'AppendRelInfo',
        'AppendState',
        'ArrayCoerceExpr',
        'ArrayCoerceExprState',
        'ArrayExpr',
        'ArrayExprState',
        'ArrayRef',
        'ArrayRefExprState',
        'A_Star',
        'BaseBackupCmd',
        'BitmapAnd',
        'BitmapAndPath',
        'BitmapAndState',
        'BitmapHeapPath',
        'BitmapHeapScan',
        'BitmapHeapScanState',
        'BitmapIndexScan',
        'BitmapIndexScanState',
        'BitmapOr',
        'BitmapOrPath',
        'BitmapOrState',
        'Bitmapset',
        'BitString',
        'Boolean',
        'BooleanTest',
        'BoolExpr',
        'BoolExprState',
        'BumpContext',
        'CallContext',
        'CallStmt',
        'CaseExpr',
        'CaseExprState',
        'CaseTestExpr',
        'CaseWhen',
        'CaseWhenState',
        'CheckPointStmt',
        'ClosePortalStmt',
        'ClusterStmt',
        'CoalesceExpr',
        'CoalesceExprState',
        'CoerceToDomain',
        'CoerceToDomainState',
        'CoerceToDomainValue',
        'CoerceViaIO',
        'CoerceViaIOState',
        'CollateClause',
        'CollateExpr',
        'ColumnDef',
        'ColumnRef',
        'CommentStmt',
        'CommonTableExpr',
        'CompositeTypeStmt',
        'Const',
        'Constraint',
        'ConstraintsSetStmt',
        'ConvertRowtypeExpr',
        'ConvertRowtypeExprState',
        'CopyStmt',
        'CreateAmStmt',
        'CreateCastStmt',
        'CreateConversionStmt',
        'CreatedbStmt',
        'CreateDomainStmt',
        'CreateEnumStmt',
        'CreateEventTrigStmt',
        'CreateExtensionStmt',
        'CreateFdwStmt',
        'CreateForeignServerStmt',
        'CreateForeignTableStmt',
        'CreateFunctionStmt',
        'CreateGroupStmt',
        'CreateOpClassItem',
        'CreateOpClassStmt',
        'CreateOpFamilyStmt',
        'CreatePLangStmt',
        'CreatePolicyStmt',
        'CreatePublicationStmt',
        'CreateRangeStmt',
        'CreateReplicationSlotCmd',
        'CreateRoleStmt',
        'CreateSchemaStmt',
        'CreateSeqStmt',
        'CreateStatsStmt',
        'CreateStmt',
        'CreateSubscriptionStmt',
        'CreateTableAsStmt',
        'CreateTableSpaceStmt',
        'CreateTransformStmt',
        'CreateTrigStmt',
        'CreateUserMappingStmt',
        'CreateUserStmt',
        'CTECycleClause',
        'CteScan',
        'CteScanState',
        'CTESearchClause',
        'CurrentOfExpr',
        'CustomPath',
        'CustomScan',
        'CustomScanState',
        'DeallocateStmt',
        'DeclareCursorStmt',
        'DefElem',
        'DefineStmt',
        'DeleteStmt',
        'DiscardStmt',
        'DistinctExpr',
        'DomainConstraintState',
        'DoStmt',
        'DropCastStmt',
        'DropdbStmt',
        'DropFdwStmt',
        'DropForeignServerStmt',
        'DropGroupStmt',
        'DropOwnedStmt',
        'DropPLangStmt',
        'DropPropertyStmt',
        'DropReplicationSlotCmd',
        'DropRoleStmt',
        'DropStmt',
        'DropSubscriptionStmt',
        'DropTableSpaceStmt',
        'DropUserMappingStmt',
        'DropUserStmt',
        'EquivalenceClass',
        'EquivalenceMember',
        'ErrorSaveContext',
        'EState',
        'EventTriggerData',
        'ExecuteStmt',
        'ExplainStmt',
        'Expr',
        'ExprContext',
        'ExprState',
        'ExtensibleNode',
        'FdwRoutine',
        'FetchStmt',
        'FieldSelect',
        'FieldSelectState',
        'FieldStore',
        'FieldStoreState',
        'FkConstraint',
        'Float',
        'ForeignKeyCacheInfo',
        'ForeignKeyOptInfo',
        'ForeignPath',
        'ForeignScan',
        'ForeignScanState',
        'FromExpr',
        'FuncCall',
        'FuncExpr',
        'FuncExprState',
        'FunctionParameter',
        'FunctionScan',
        'FunctionScanState',
        'FuncWithArgs',
        'Gather',
        'GatherMerge',
        'GatherMergePath',
        'GatherMergeState',
        'GatherPath',
        'GatherState',
        'GenerationContext',
        'GenericExprState',
        'GrantRoleStmt',
        'GrantStmt',
        'Group',
        'GroupByOrdering',
        'GroupClause',
        'GroupingFunc',
        'GroupingFuncExprState',
        'GroupingSet',
        'GroupingSetData',
        'GroupingSetsPath',
        'GroupPath',
        'GroupResultPath',
        'GroupState',
        'Hash',
        'HashJoin',
        'HashJoinState',
        'HashPath',
        'HashState',
        'IdentifySystemCmd',
        'ImportForeignSchemaStmt',
        'InClauseInfo',
        'IncrementalSort',
        'IncrementalSortPath',
        'IncrementalSortState',
        'IndexAmRoutine',
        'IndexClause',
        'IndexElem',
        'IndexInfo',
        'IndexOnlyScan',
        'IndexOnlyScanState',
        'IndexOptInfo',
        'IndexPath',
        'IndexScan',
        'IndexScanState',
        'IndexStmt',
        'InferClause',
        'InferenceElem',
        'InhRelation',
        'InlineCodeBlock',
        'InnerIndexscanInfo',
        'InsertStmt',
        'Integer',
        'IntList',
        'IntoClause',
        'Invalid',
        'Join',
        'JoinDomain',
        'JoinExpr',
        'JoinInfo',
        'JOIN_RIGHANTI',
        'JoinState',
        'JsonAggConstructor',
        'JsonArgument',
        'JsonArrayAgg',
        'JsonArrayConstructor',
        'JsonArrayQueryConstructor',
        'JsonBehavior',
        'JsonConstructorExpr',
        'JsonExpr',
        'JsonFormat',
        'JsonFuncExpr',
        'JsonIsPredicate',
        'JsonKeyValue',
        'JsonObjectAgg',
        'JsonObjectConstructor',
        'JsonOutput',
        'JsonParseExpr',
        'JsonReturning',
        'JsonScalarExpr',
        'JsonSerializeExpr',
        'JsonTable',
        'JsonTableColumn',
        'JsonTablePath',
        'JsonTablePathScan',
        'JsonTablePathSpec',
        'JsonTableSiblingJoin',
        'JsonValueExpr',
        'JunkFilter',
        'LateralJoinInfo',
        'LIMIOPTION_COUNT',
        'LIMIOPTION_DEFAULT',
        'LIMIOPTION_WITH_TIES',
        'Limit',
        'LimitPath',
        'LimitState',
        'List',
        'ListenStmt',
        'LoadStmt',
        'LockingClause',
        'LockRows',
        'LockRowsPath',
        'LockRowsState',
        'LockStmt',
        'Material',
        'MaterialPath',
        'MaterialState',
        'Memoize',
        'MemoizePath',
        'MemoizeState',
        'MemoryContext',
        'MergeAction',
        'MergeActionState',
        'MergeAppend',
        'MergeAppendPath',
        'MergeAppendState',
        'MergeJoin',
        'MergeJoinState',
        'MergePath',
        'MergeStmt',
        'MergeSupportFunc',
        'MergeWhenClause',
        'MinMaxAggInfo',
        'MinMaxAggPath',
        'MinMaxExpr',
        'MinMaxExprState',
        'ModifyTable',
        'ModifyTablePath',
        'ModifyTableState',
        'MultiAssignRef',
        'NamedArgExpr',
        'NamedTuplestoreScan',
        'NamedTuplestoreScanState',
        'NestLoop',
        'NestLoopParam',
        'NestLoopState',
        'NestPath',
        'NextValueExpr',
        'NotifyStmt',
        'Null',
        'NullIfExpr',
        'NullTest',
        'NullTestState',
        'ObjectWithArgs',
        'OidList',
        'ONCONFLICNONE',
        'ONCONFLICNOTHING',
        'OnConflictClause',
        'OnConflictExpr',
        'OnConflictSetState',
        'ONCONFLICUPDATE',
        'OpExpr',
        'OuterJoinClauseInfo',
        'Param',
        'ParamPathInfo',
        'ParamRef',
        'PartitionBoundSpec',
        'PartitionCmd',
        'PartitionedChildRelInfo',
        'PartitionedRelPruneInfo',
        'PartitionElem',
        'PartitionPruneInfo',
        'PartitionPruneStepCombine',
        'PartitionPruneStepOp',
        'PartitionRangeDatum',
        'PartitionSpec',
        'Path',
        'PathKey',
        'PathKeyInfo',
        'PathKeyItem',
        'PathTarget',
        'PlaceHolderInfo',
        'PlaceHolderVar',
        'Plan',
        'PlanInvalItem',
        'PlannedStmt',
        'PlannerGlobal',
        'PlannerInfo',
        'PlannerParamItem',
        'PlanRowMark',
        'PlanState',
        'PLAssignStmt',
        'PrepareStmt',
        'PrivGrantee',
        'PrivTarget',
        'ProjectionInfo',
        'ProjectionPath',
        'ProjectSet',
        'ProjectSetPath',
        'ProjectSetState',
        'PublicationObjSpec',
        'PublicationTable',
        'Query',
        'RangeFunction',
        'RangeSubselect',
        'RangeTableFunc',
        'RangeTableFuncCol',
        'RangeTableSample',
        'RangeTblEntry',
        'RangeTblFunction',
        'RangeTblRef',
        'RangeVar',
        'RawStmt',
        'ReadReplicationSlotCmd',
        'ReassignOwnedStmt',
        'RecursiveUnion',
        'RecursiveUnionPath',
        'RecursiveUnionState',
        'RefreshMatViewStmt',
        'ReindexStmt',
        'RelabelType',
        'RelOptInfo',
        'RemoveAggrStmt',
        'RemoveFuncStmt',
        'RemoveOpClassStmt',
        'RemoveOperStmt',
        'RemoveOpFamilyStmt',
        'RenameStmt',
        'ReplicaIdentityStmt',
        'Resdom',
        'ResTarget',
        'RestrictInfo',
        'Result',
        'ResultPath',
        'ResultRelInfo',
        'ResultState',
        'ReturnSetInfo',
        'ReturnStmt',
        'RoleSpec',
        'RollupData',
        'RowCompareExpr',
        'RowCompareExprState',
        'RowExpr',
        'RowExprState',
        'RowIdentityVarInfo',
        'RowMarkClause',
        'RTEPermissionInfo',
        'RuleStmt',
        'SampleScan',
        'SampleScanState',
        'ScalarArrayOpExpr',
        'ScalarArrayOpExprState',
        'Scan',
        'ScanState',
        'SecLabelStmt',
        'SelectStmt',
        'SeqScan',
        'SeqScanState',
        'SetExprState',
        'SetOp',
        'SETOPCMD_EXCEPALL',
        'SETOPCMD_INTERSECALL',
        'SetOperationStmt',
        'SetOpPath',
        'SetOpState',
        'SetToDefault',
        'SinglePartitionSpec',
        'SlabContext',
        'Sort',
        'SortBy',
        'SortClause',
        'SortGroupClause',
        'SortPath',
        'SortState',
        'SpecialJoinInfo',
        'SQLCmd',
        'SQLValueFunction',
        'StartReplicationCmd',
        'StatisticExtInfo',
        'StatsElem',
        'String',
        'SubLink',
        'SubPlan',
        'SubPlanState',
        'SubqueryScan',
        'SubqueryScanPath',
        'SubqueryScanState',
        'SubscriptingRef',
        'SupportRequestCost',
        'SupportRequestIndexCondition',
        'SupportRequestOptimizeWindowClause',
        'SupportRequestRows',
        'SupportRequestSelectivity',
        'SupportRequestSimplify',
        'SupportRequestWFuncMonotonic',
        'TableAmRoutine',
        'TableFunc',
        'TableFuncScan',
        'TableFuncScanState',
        'TableLikeClause',
        'TableSampleClause',
        'TargetEntry',
        'TIDBitmap',
        'TidPath',
        'TidRangePath',
        'TidRangeScan',
        'TidRangeScanState',
        'TidScan',
        'TidScanState',
        'TimeLineHistoryCmd',
        'TransactionStmt',
        'TriggerData',
        'TriggerTransition',
        'TruncateStmt',
        'TsmRoutine',
        'TupleTableSlot',
        'TypeCast',
        'TypeName',
        'Unique',
        'UniquePath',
        'UniqueState',
        'UnlistenStmt',
        'UpdateStmt',
        'UploadManifestCmd',
        'UpperUniquePath',
        'VacuumRelation',
        'VacuumStmt',
        'Value',
        'ValuesScan',
        'ValuesScanState',
        'Var',
        'VariableResetStmt',
        'VariableSetStmt',
        'VariableShowStmt',
        'ViewStmt',
        'WholeRowVarExprState',
        'WindowAgg',
        'WindowAggPath',
        'WindowAggState',
        'WindowClause',
        'WindowDef',
        'WindowFunc',
        'WindowFuncExprState',
        'WindowFuncRunCondition',
        'WindowObjectData',
        'WithCheckOption',
        'WithClause',
        'WorkTableScan',
        'WorkTableScanState',
        'XidList',
        'XmlExpr',
        'XmlExprState',
        'XmlSerialize',
    ]
}


/**
 * Return array of known Node `typedef's.
 * First element is alias and second is type.
 * 
 * @returns Array of pairs: alias -> type
 */
export function getDefaultAliases(): [string, string][] {
    return [
        ['Relids', 'Bitmapset *'],
        ['MemoryContext', 'MemoryContextData *']
    ]
}

export interface ArraySpecialMember {
    typeName: string;
    memberName: string;
    lengthExpr: string
}

export function getArraySpecialMembers(): ArraySpecialMember[] {
    const _ = (typeName: string, memberName: string, lengthExpr: string) => ({
        typeName,
        memberName,
        lengthExpr
    });

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