import { ListPtrSpecialMemberInfo } from "./variables";

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
 * Returns list of Expr nodes, whose text representation is displayed in
 * variables view as separate member.
 */
export function getDisplayedExprs(): string[] {
    return [
        'Aggref',
        'ArrayCoerceExpr',
        'ArrayExpr',
        'ArrayRef',
        'BoolExpr',
        'BooleanTest',
        'CaseWhen',
        'CoalesceExpr',
        'CoerceToDomain',
        'CoerceViaIO',
        'Const',
        'ConvertRowtypeExpr',
        'CurrentOfExpr',
        'DistinctExpr',
        'FieldSelect',
        'FieldStore',
        'FuncExpr',
        'GroupingFunc',
        'InferenceElem',
        'JsonConstructorExpr',
        'JsonExpr',
        'JsonIsPredicate',
        'JsonValueExpr',
        'MinMaxExpr',
        'NullIfExpr',
        'NullTest',
        'OpExpr',
        'Param',
        'RelabelType',
        'RowCompareExpr',
        'RowExpr',
        'SQLValueFunction',
        'ScalarArrayOpExpr',
        'SubLink',
        'SubscriptingRef',
        'TargetEntry',
        'Var',
        'WindowFunc',
        'WindowFuncFuncCondition',
        'XmlExpr',

        /* This is actually not Expr, but handy to see representation */
        'PlaceHolderVar',
    ]
}

export function getKnownCustomListPtrs(): ListPtrSpecialMemberInfo[] {
    const member = (type: string, struct: string, member: string): ListPtrSpecialMemberInfo => ({
        type: type + ' *',
        member: [struct, member]
    });

    const variable = (type: string, func: string, variable: string): ListPtrSpecialMemberInfo => ({
        type: type + ' *',
        variable: [func, variable]
    });

    return [
        /* contrib/amcheck/verify_heapam.c */
        member('ToastedAttribute', 'HeapCheckContext', 'toasted_attributes'),
        
        /* src/backend/access/index/amvalidate.c */
        variable('OpFamilyOpFuncGroup', 'indentify_opfamily_groups', 'result'),
        
        /* contrib/bloom/blvalidate.c */
        variable('OpFamilyOpFuncGroup', 'blvalidate', 'grouplist'),

        /* contrib/pg_trgm/trgm_regexp.c */
        member('TrgmState', 'TrgmNFA', 'queue'),
        member('TrgmStateKey', 'TrgmNFA', 'keysQueue'),
        member('TrgmStateKey', 'TrgmNFA', 'enterKeys'),
        member('TrgmArcInfo', 'ColorTrgmInfo', 'arcs'),
        member('TrgmArc', 'TrgmState', 'arcs'),

        /* contrib/postgres_fdw/connection.c */
        variable('ConnCacheEntry', 'pgfdw_finish_pre_commit_cleanup', 'pending_entries'),
        variable('ConnCacheEntry', 'pgfdw_xact_callback', 'pending_entries'),
        variable('ConnCacheEntry', 'pgfdw_xact_callback', 'cancel_requested'),
        variable('ConnCacheEntry', 'pgfdw_finish_pre_commit_cleanup', 'pending_deallocs'),
        variable('ConnCacheEntry', 'pgfdw_finish_abort_cleanup', 'cancel_requested'),
        variable('ConnCacheEntry', 'pgfdw_finish_abort_cleanup', 'pending_deallocs'),
        variable('ConnCacheEntry', 'pgfdw_finish_abort_cleanup', 'pending_entries'),
        
        /* contrib/postgres_fdw/deparse.c */
        variable('char', 'appendWhereClause', 'additional_conds'),
        variable('char', 'deparseFromExpr', 'additional_conds'),
        variable('char', 'postgresImportForeignSchema', 'commands'),
        variable('RelationData', 'deparseTruncateSql', 'rels'),
        variable('RelationData', 'postgresExecForeignTruncate', 'rels'),

        
        /* contrib/postgres_fdw/option.c */
        variable('const char', 'ExtractExtensionList', 'extlist'),

        /* contrib/sepgsql/label.c */
        variable('pending_label', 'sepgsql_subxact_callback', 'client_label_pending'),
        
        /* src/backend/access/brin/brin_validate.c */
        variable('OpFamilyOpFuncGroup', 'brinvalidate', 'grouplist'),
        member('local_relopt', 'local_relopts', 'options'),
        member('void', 'local_relopts', 'validators'),

        /* src/backend/access/gin/ginvalidate.c */
        variable('OpFamilyMember', 'ginadjustmembers', 'operators'),
        variable('OpFamilyMember', 'ginadjustmembers', 'functions'),

        /* src/backend/access/gist/gistbuild.c */
        variable('GISTPageSplitInfo', 'gistbufferinginserttuples', 'splitinfo'),

        /* src/backend/access/gist/gistbuildbuffers.c */
        variable('GISTPageSplitInfo', 'gistRelocateBuildBuffersOnSplit', 'splitinfo'),

        /* src/backend/access/gist/gistvalidate.c */
        variable('OpFamilyOpFuncGroup', 'gistvalidate', 'grouplist'),
        variable('OpFamilyMember', 'gistadjustmembers', 'operators'),
        variable('OpFamilyMember', 'gistadjustmembers', 'functions'),

        /* src/backend/access/hash/hashvalidate.c */
        variable('OpFamilyOpFuncGroup', 'hashvalidate', 'grouplist'),
        variable('OpFamilyMember', 'hashadjustmembers', 'operators'),
        variable('OpFamilyMember', 'hashadjustmembers', 'functions'),

        /* src/backend/access/nbtree/nbvalidate.c */
        variable('OpFamilyOpFuncGroup', 'btvalidate', 'grouplist'),
        variable('OpFamilyMember', 'btadjustmembers', 'operators'),
        variable('OpFamilyMember', 'btadjustmembers', 'functions'),
        
        /* src/backend/access/spgist/spgvalidate.c */
        variable('OpFamilyOpFuncGroup', 'spgvalidate', 'grouplist'),
        variable('OpFamilyMember', 'spgadjustmembers', 'functions'),
        variable('OpFamilyMember', 'spgadjustmembers', 'operators'),

        /* src/backend/access/transam/timeline.c */
        variable('TimeLineHistoryEntry', 'tliInHistory', 'expectedTLEs'),
        variable('TimeLineHistoryEntry', 'tliOfPointInHistory', 'history'),
        variable('TimeLineHistoryEntry', 'tliSwitchPoint', 'history'),

        /* src/backend/access/transam/xlog.c */
        variable('char *', 'check_wal_consistency_checking', 'elemlist'),

        /* src/backend/access/transam/timeline.c */
        variable('TimeLineHistoryEntry', 'readTimeLineHistory', 'result'),

        /* src/backend/access/transam/xlogrecovery.c */
        variable('tablespaceinfo', 'InitWalRecovery', 'tablespaces'),
        variable('TimeLineHistoryEntry', 'rescanLatestTimeLine', 'newExpectedTLEs'),
        variable('TimeLineHistoryEntry', 'XLogFileReadAnyTLI', 'tles'),
        variable('TimeLineHistoryEntry', 'checkTimeLineSwitch', 'exptectedTLEs'),
        variable('TimeLineHistoryEntry', 'WaitForWALToBecomeAvailable', 'exptectedTLEs'),

        /* src/backend/backup/backup_manifest.c */
        variable('TimeLineHistoryEntry', 'AddWALInfoToBackupManifest', 'timelines'),
        
        /* src/backend/backup/basebackup_copy.c */
        variable('tablespaceinfo', 'SendTablespaceList', 'tablespaces'),

        /* src/backend/backup/basebackup_incremental.c */
        variable('TimeLineHistoryEntry', 'PrepareForIncrementalBackup', 'expectedTLEs'),
        variable('TimeLineHistoryEntry', 'PrepareForIncrementalBackup', 'required_wslist'),

        /* src/backend/backup/basebackup_target.c */
        variable('BaseBackupTargetType', 'BaseBackupAddTarget', 'BaseBackupTargetTypeList'),
        variable('BaseBackupTargetType', 'BaseBackupGetTargetHandle', 'BaseBackupTargetTypeList'),

        /* src/backend/{backup/relation}/basebackup.c */
        member('tablespaceinfo', 'bbsink_state', 'tablespaces'),
        variable('char', 'perform_base_backup', 'walFileList'),
        variable('char', 'perform_base_backup', 'historyFileList'),
        variable('tablespaceinfo', 'perform_base_backup', 'tablespaces'),
        variable('tablespaceinfo', 'SendBackupHeader', 'tablespaces'),
        variable('tablespaceinfo', 'sendDir', 'tablespaces'),

        /* src/backend/backup/walsummary.c */
        variable('WalSummaryFile', 'FilterWalSummaries', 'wslist'),
        variable('WalSummaryFile', 'WalSummariesAreComplete', 'wslist'),
        variable('WalSummaryFile', 'GetWalSummaries', 'result'),

        /* src/backend/backup/walsummaryfuncs.c */
        variable('WalSummaryFile', 'pg_available_wal_summaries', 'wslist'),

        /* src/backned/bootstrap/bootstrap.c */
        variable('strcut typmap', 'gettype', 'Typ'),
        variable('strcut typmap', 'boot_get_type_io_data', 'Typ'),

        /* src/backend/catalog/heap.c */
        variable('CookedConstraint', 'StoreConstraints', 'cooked_constraints'),
        variable('char', 'AddRelationNewConstraints', 'checknames'),
        variable('char', 'AddRelationRawConstraints', 'checknames'),
        variable('RawColumnDefault', 'AddRelationNewConstraints', 'newColDefaults'),
        variable('RelationData', 'heap_truncate', 'relations'),
        variable('RelationData', 'heap_truncate_check_FKs', 'relations'),

        /* src/backend/catalog/index.c */
        variable('char', 'ConstructTupleDescriptor', 'indexColNames'),
        variable('char', 'index_create', 'indexColNames'),

        /* srck/backend/catalog/namespace.c */
        variable('char', 'MatchNamedCall', 'argnames'),
        variable('char', 'preprocessNamespacePath', 'namelist'),
        variable('char', 'FuncnameGetCandidates', 'argnames'),
        variable('char', 'recomputeNamespacePath', 'namelist'),
        
        /* src/backend/catalog/objectaddress.c */
        variable('char', 'strlist_to_textarray', 'list'),
        variable('char', 'pg_identify_object_as_address', 'names'),
        variable('char', 'pg_identify_object_as_address', 'args'),
        
        /* src/backend/catalog/pg_constraint.c */
        variable('char', 'ChooseConstraintName', 'others'),

        /* src/backend/catalog/pg_subscription.c */
        variable('SubscriptionRelState', 'GetSubscriptionRelations', 'res'),
        variable('SubscriptionRelState', 'GetSubscriptionNotReadyRelations', 'res'),

        /* src/backend/catalog/pg_publication.c */
        variable('published_rel', 'is_ancestor_member_tableinfos', 'table_infos'),
        variable('published_rel', 'filter_partitions', 'table_infos'),
        variable('published_rel', 'pg_get_publication_tables', 'table_infos'),

        /* src/backend/catalog/pg_shdepend.c */
        variable('remoteDep', 'checkSharedDependencies', 'remDeps'),

        /* src/backend/commands/async.c */
        member('ListenAction', 'ActionList', 'actions'),
        variable('char', 'Exec_ListenCommit', 'listenChannels'),
        variable('char', 'IsListeningOn', 'listenChannels'),
        member('Notification', 'NotificationList', 'events'),
        variable('ListenAction', 'AtCommit_Notify', 'pendingActions'),
        variable('char', 'AtCommit_Notify', 'pendingNotifies'),

        /* src/backend/commands/cluster.c */
        variable('RelToCluster', 'cluster_multiple_rels', 'rtcs'),
        variable('RelToCluster', 'cluster', 'rtcs'),
        variable('RelToCluster', 'cluster', 'rvs'),
        variable('RelToCluster', 'get_tables_to_cluster', 'rtcs'),
        variable('RelToCluster', 'get_tables_to_cluster', 'rvs'),
        variable('RelToCluster', 'get_tables_to_cluster_partitioned', 'rtcs'),

        /* src/backend/commands/copyfrom.c */
        member('CopyMultiInsertBuffer', 'CopyMultiInsertInfo', 'multiInsertBuffers'),

        /* src/backend/commands/dbcommands.c */
        variable('CreateDBRelInfo', 'CreateDatabaseUsingWalLog', 'rlocatorlist'),
        variable('CreateDBRelInfo', 'ScanSourceDatabasePgClass', 'rlocatorlist'),
        variable('CreateDBRelInfo', 'ScanSourceDatabasePgClassPage', 'rlocatorlist'),

        /* src/backend/commands/event_trigger.c */
        variable('const char', 'filter_list_to_array', 'filterlist'),
        variable('EventTriggerCacheItem', 'EventTriggerCommonSetup', 'cachelist'),
        member('CollectedCommand', 'EventTriggerQueryState', 'commandList'),
        member('char', 'SQLDropObject', 'addrnames'),
        member('char', 'SQLDropObject', 'addrargs'),

        /* src/backend/commands/explain.c */
        variable('const char', 'show_tablesample', 'params'),
        variable('char', 'show_incremental_sort_group_info', 'methodNames'),
        variable('const char', 'ExplainPropertyList', 'data'),
        variable('const char', 'ExplainPropertyListNested', 'data'),
        variable('const char', 'show_plan_tlist', 'result'),
        variable('const char', 'show_sort_group_keys', 'result'),
        variable('const char', 'show_sort_group_keys', 'resultPresorted'),
        variable('const char', 'show_incremental_sort_group_info', 'methodNames'),
        variable('const char', 'show_modifytable_info', 'idxNames'),

        /* src/backend/commands/extension.c */
        member('ExtensionVersionInfo', 'ExtensionVersionInfo', 'reachable'),
        member('char', 'ExtensionControlFile', 'no_relocate'),
        member('char', 'ExtensionControlFile', 'requires'),
        variable('ExtensionVersionInfo', 'get_nearest_unprocessed_vertex', 'evi_list'),
        variable('ExtensionVersionInfo', 'find_update_path', 'evi_list'),
        variable('ExtensionVersionInfo', 'find_install_path', 'evi_list'),
        variable('ExtensionVersionInfo', 'identify_update_path', 'evi_list'),
        variable('ExtensionVersionInfo', 'CreateExtensionInternal', 'evi_list'),
        variable('char', 'get_required_extension', 'parents'),
        variable('ExtensionVersionInfo', 'get_available_versions_for_extension', 'evi_list'),
        variable('char', 'convert_requires_to_datum', 'requires'),
        variable('ExtensionVersionInfo', 'pg_extension_update_paths', 'evi_list'),
        variable('char', 'pg_extension_update_paths', 'path'),
        variable('char', 'ApplyExtensionUpdates', 'updateVersions'),
        variable('ExtensionVersionInfo', 'get_ext_ver_list', 'evi_list'),

        /* src/backend/commands/foreigncmds.c */
        variable('char', 'ImportForeignSchema', 'cmd_list'),

        /* src/backend/commands/indexcmds.c */
        variable('char', 'ChooseIndexNameAddition', 'colnames'),
        variable('char', 'ChooseIndexColumnNames', 'result'),
        variable('ReindexIndexInfo', 'ReindexRelationConcurrently', 'indexIds'),
        variable('ReindexIndexInfo', 'ReindexRelationConcurrently', 'newIndexIds'),
        variable('LOCKTAG', 'ReindexRelationConcurrently', 'lockTags'),
        variable('LockRelId', 'ReindexRelationConcurrently', 'relationLocks'),
        variable('char', 'ChooseIndexName', 'colnames'),
        variable('char', 'DefineIndex', 'indexColNames'),

        /* src/backend/commands/opclasscmds.c */
        variable('OpFamilyMember', 'DefineOpClass', 'operators'),
        variable('OpFamilyMember', 'DefineOpClass', 'procedures'),
        variable('OpFamilyMember', 'storeOperators', 'operators'),
        variable('OpFamilyMember', 'storeProcedures', 'procedures'),
        variable('OpFamilyMember', 'dropProcedures', 'procedures'),

        /* src/backend/commands/publicationcmds.c */
        variable('char', 'parse_publication_options', 'publish_list'),
        variable('PublicationRelInfo', 'TransformPubWhereClauses', 'tables'),
        variable('PublicationRelInfo', 'CheckPubRelationColumnList', 'tables'),
        variable('PublicationRelInfo', 'AlterPublicationTables', 'rels'),
        variable('PublicationRelInfo', 'CloseTableList', 'rels'),
        variable('PublicationRelInfo', 'PublicationAddTables', 'rels'),
        variable('PublicationRelInfo', 'PublicationDropTables', 'rels'),
        variable('PublicationRelInfo', 'CreatePublication', 'rels'),
        variable('PublicationRelInfo', 'OpenTableList', 'rels'),
        /* old versions have plain 'Relation' instead of 'PublicationRelInfo' */

        /* src/backend/commands/seclabel.c */
        variable('LabelProvider', 'ExecSecLabelStmt', 'label_provider_list'),

        /* src/backend/commands/subscriptioncmds.c */
        variable('SubscriptionRelState', 'AlterSubscription_refresh', 'subrel_states'),
        variable('LogicalRepWorker', 'DropSubscription', 'subworkers'),
        variable('SubscriptionRelState', 'DropSubscription', 'rstates'),
        variable('SubscriptionRelState', 'ReportSlotConnectionError', 'rstates'),

        /* src/backend/commands/tablecmds.c */
        variable('CookedConstraint', 'MergeCheckConstraint', 'constraints'),
        member('NewConstraint', 'AlteredTableInfo', 'constraints'),
        member('NewColumnValue', 'AlteredTableInfo', 'newvals'),
        member('char', 'AlteredTableInfo', 'changedIndexDefs'),
        member('char', 'AlteredTableInfo', 'changedConstraintDefs'),
        member('char', 'AlteredTableInfo', 'changedStatisticsDefs'),
        member('RelationData', 'ForeignTruncateInfo', 'rels'),
        variable('const char', 'ChooseForeignKeyConstraintNameAddition', 'colnames'),
        variable('CookedConstraint','ATAddCheckConstraint', 'newcons'),
        variable('OnCommitItem', 'remove_on_commit_action', 'on_commits'),
        variable('OnCommitItem', 'PreCommit_on_commit_actions', 'on_commits'),
        variable('OnCommitItem', 'AtEOXact_on_commit_actions', 'on_commits'),
        variable('OnCommitItem', 'AtEOSubXact_on_commit_actions', 'on_commits'),
        variable('CookedConstraint', 'MergeAttributes', 'constraints'),
        variable('RelationData', 'ExecuteTruncateGuts', 'rels'),
        variable('RelationData', 'ExecuteTruncate', 'rels'),
        variable('char', 'RemoveInheritance', 'connames'),

        /* src/backend/commands/tablespace.c */
        variable('char', 'check_temp_tablespaces', 'namelist'),
        variable('char', 'PrepareTempTablespaces', 'namelist'),

        /* src/backend/commands/trigger.c */
        member('AfterTriggersTableData', 'AfterTriggersQueryData', 'tables'),
        variable('AfterTriggersTableData', 'AfterTriggerFreeQuery', 'tables'),

        /* src/backend/commands/tsearchcmds.c */
        variable('TSTokenTypeItem', 'tstoken_list_member', 'tokens'),
        variable('TSTokenTypeItem', 'MakeConfigurationMapping', 'tokens'),
        variable('TSTokenTypeItem', 'getTokenTypes', 'result'),

        /* src/backend/commands/typecmds.c */
        variable('RelToCheck', 'validateDomainNotNullConstraint', 'rels'),
        variable('RelToCheck', 'validateDomainCheckConstraint', 'rels'),
        variable('RelToCheck', 'get_rels_with_domain', 'result'),

        /* src/backend/commands/user.c */
        variable('char', 'check_createrole_self_grant', 'elemlist'),

        /* src/backend/commands/variable.c */
        variable('char', 'check_datestyle', 'elemlist'),
        variable('char', 'assign_datestyle', 'elemlist'),
        
        /* src/backend/executor/execMain.c */
        member('ExecAuxRowMark', 'EPQState', 'arowMarks'),
        
        /* src/backend/executor/execPartition.c */
        variable('PartitionPruneStepOp', 'InitPartitionPruneContext', 'pruning_steps'),
        member('PartitionPruneStepOp', 'PartitionedRelPruneInfo', 'initial_pruning_steps'),
        member('PartitionPruneStepOp', 'PartitionedRelPruneInfo', 'exec_pruning_steps'),
        member('PartitionPruneStepOp', 'PartitionedRelPruningData', 'initial_pruning_steps'),
        member('PartitionPruneStepOp', 'PartitionedRelPruningData', 'exec_pruning_steps'),

        /* src/include/nodes/execnodes.h */
        member('ResultRelInfoExtra', 'EState', 'es_resultrelinfo_extra'),
        member('execRowMark', 'EState', 'es_rowMark'),

        /* src/backend/executor/functions.c */
        variable('execution_state', 'fmgr_sql', 'eslist'),
        member('execution_state', 'SQLFunctionCachePtr', 'func_state'),
        variable('execution_state', 'init_execution_state', 'eslist'),

        /* src/backend/executor/nodeLockRows.c */
        member('ExecAuxRowMark', 'LockRowsState', 'lr_arowMarks'),
        variable('ExecAuxRowMark', 'ExecInitLockRows', 'epq_arowmarks'),

        /* src/backend/executor/nodeTidrangescan.c */
        member('TidOpExpr', 'TidRangeScanState', 'trss_tidexprs'),

        /* src/backend/executor/nodeTidscan.c */
        member('TidExpr', 'TidScanState', 'tss_tidexprs'),

        /* src/backend/executor/spi.c */
        member('CachedPlanSource', 'SPIPlanPtr', 'plancache_list'),
        variable('CachedPlanSource', '_SPI_prepare_plan', 'plancache_list'),

        /* src/backend/jit/llvm/llvmjit.c */
        variable('LLVMJitHandle', 'LLVMJitContext', 'handles'),

        /* src/include/libpq/hba.h */
        member('char', 'HbaLine', 'radiusservers'),
        member('char', 'HbaLine', 'radiussecrets'),
        member('char', 'HbaLine', 'radiusidentifiers'),
        member('char', 'HbaLine', 'radiusports'),
        member('AuthToken', 'HbaLine', 'databases'),
        member('AuthToken', 'HbaLine', 'roles'),

        /* src/backend/libpq/hba.c */
        variable('char', 'tokenize_expand_file', 'inc_lines'),
        variable('AuthToken', 'tokenize_expand_file', 'inc_tokens'),
        variable('AuthToken', 'tokenize_expand_file', 'tokens'),
        variable('AuthToken', 'check_role', 'tokens'),
        variable('AuthToken', 'check_db', 'tokens'),
        variable('AuthToken', 'parse_hba_line', 'tokens'),
        /* old versions have 'HbaToken' instead of 'AuthToken' */
        variable('char', 'parse_hba_auth_opt', 'parsed_servers'),
        variable('char', 'parse_hba_auth_opt', 'parsed_ports'),
        variable('HbaLine', 'check_hba', 'parsed_hba_lines'),
        variable('IdentLine', 'check_usermap', 'parsed_ident_lines'),
        variable('TokenizedAuthLine', 'load_hba', 'hba_lines'),
        variable('TokenizedAuthLine', 'load_ident', 'ident_lines'),

        /* old versions have 'TokenizedLine' instead of 'TokenizedAuthLine' */
        variable('HbaToken', 'tokenize_inc_file', 'inc_tokens'),

        /* src/backend/libpq/pqcomm.c */
        variable('char', 'TouchSocketFiles', 'sock_paths'),
        variable('char', 'RemoveSocketFiles', 'sock_paths'),

        /* src/backend/optimizer/geqo/geqo_eval.c */
        variable('Clump', 'gimme_tree', 'clumps'),
        variable('Clump', 'merge_clump', 'clumps'),

        /* src/backend/optimizer/path/allpaths.c */
        variable('OpBtreeInterpretation', 'find_window_run_conditions', 'opinfos'),

        /* src/backend/optimizer/prep/prepjointree.c */
        variable('reduce_outer_joins_state', 'reduce_outer_joins_state', 'sub_states'),

        /* src/include/nodes/pathnodes.h */
        member('MergeScanSelCache', 'RestrictInfo', 'scansel_cache'),

        /* src/backend/utils/cache/lsyscache.c */
        variable('OpBtreeInterpretation', 'get_op_btree_interpretation', 'result'),

        /* src/backend/utils/cache/typcache.c */
        {
            type: 'struct tupleDesc *',
            member: ['RecordCacheEntry', 'tupdescs']
        },

        /* src/backend/optimizer/util/predtest.c */
        variable('OpBtreeInterpretation', 'lookup_proof_cache', 'clause_op_infos'),
        variable('OpBtreeInterpretation', 'lookup_proof_cache', 'pred_op_infos'),

        /* src/backend/optimizer/util/tlist.c */
        variable('split_pathtarget_item', 'add_sp_items_to_pathtargets', 'items'),
        variable('split_pathtarget_item', 'split_pathtarget_at_srfs', 'level_srfs'),
        variable('split_pathtarget_item', 'split_pathtarget_at_srfs', 'input_vars'),
        variable('split_pathtarget_item', 'split_pathtarget_at_srfs', 'input_srfs'),
        
        /* src/backend/optimizer/util/plancat.c */
        member('PartitionSchemeData', 'PlannerInfo', 'part_schemes'),

        /* src/backend/parser/parse_clause.c */
        variable('ParseNamespaceItem', 'setNamespaceColumnVisibility', 'namespace'),
        variable('ParseNamespaceItem', 'setNamespaceLateralState', 'namespace'),
        variable('ParseNamespaceItem', 'transformFromClauseItem', 'my_namespace'),
        variable('ParseNamespaceItem', 'transformFromClauseItem', 'r_namespace'),
        variable('ParseNamespaceItem', 'transformFromClauseItem', 'l_namespace'),
        variable('ParseNamespaceItem', 'transformFromClause', 'namespace'),

        /* src/backend/parser/parse_func.c */
        variable('char', 'ParseFuncOrColumn', 'argnames'),
        variable('char', 'func_get_detail', 'fargnames'),

        /* src/backend/parser/parse_jsontable.c */
        member('char', 'JsonTableParseContext', 'pathNames'),

        /* src/backend/parser/parse_merge.c */
        variable('ParseNamespaceItem', 'setNamespaceVisibilityForRTE', 'namespace'),

        /* src/include/parser/parse_node.h */
        member('ParseNamespaceItem', 'ParseState', 'p_namespace'),

        /* src/backend/parser/parse_relation.c */
        variable('ParseNamespaceItem', 'checkNameSpaceConflicts', 'namespace1'),
        variable('ParseNamespaceItem', 'checkNameSpaceConflicts', 'namespace2'),

        /* src/backend/partitioning/partbounds.c */
        variable('Datum', 'build_merged_partition_bounds', 'merged_datums'),
        variable('PartitionRangeDatumKind', 'build_merged_partition_bounds', 'merged_kinds'),
        variable('Datum', 'merge_list_bounds', 'marged_datums'),

        /* src/backend/partitioning/partprune.c */
        variable('PartClauseInfo', 'gen_prune_steps_from_opexps', 'eq_clauses'),
        variable('PartClauseInfo', 'gen_prune_steps_from_opexps', 'le_clauses'),
        variable('PartClauseInfo', 'gen_prune_steps_from_opexps', 'ge_clauses'),
        variable('PartClauseInfo', 'gen_prune_steps_from_opexps', 'clauselist'),
        variable('PartClauseInfo', 'get_steps_using_prefix_recurse', 'prefix'),
        variable('PartClauseInfo', 'get_steps_using_prefix', 'prefix'),

        /* src/backend/postmaster/autovacuum.c */
        variable('avw_dbase', 'rebuild_database_list', 'dblist'),
        variable('avw_dbase', 'do_start_worker', 'dblist'),

        /* src/backend/postmaster/postmaster.c */
        variable('char', 'PostmasterMain', 'elemlist'),

        /* src/backend/postmaster/syslogger.c */
        variable('save_buffer', 'process_pipe_input', 'buffer_list'),
        variable('save_buffer', 'flush_pipe_input', 'list'),

        /* src/backend/postmaster/walsummarizer.c */
        variable('WalSummaryFile', 'GetOldestUnsummarizedLSN', 'existing_summaries'),
        variable('WalSummaryFile', 'MayberemoveOldWalSummaries', 'wslist'),

        /* src/backend/replication/syncrep_gram.c */
        variable('char', 'create_syncrep_config', 'members'),

        /* src/backend/replication/logical/applyparallelworker.c */
        variable('ParallelApplyWorkerInfo', 'pa_launch_parallel_worker', 'ParallelApplyWorkerPool'),
        variable('ParallelApplyWorkerInfo', 'pa_launch_parallel_worker', 'ParallelApplyWorkerPool'),
        variable('ParallelApplyWorkerInfo', 'HandleParallelApplyMessages', 'ParallelApplyWorkerPool'),

        /* src/backend/replication/logical/launcher.c */
        variable('LogicalRepWorker', 'logicalrep_worker_detach','workers'),
        variable('LogicalRepWorker', 'logicalrep_workers_find', 'res'),
        variable('Subscription', 'ApplyLauncherMain', 'sublist'),
        variable('Subscription', 'get_subscription_list', 'res'),

        /* src/backend/replication/logical/reorderbuffer.c */
        variable('RewriteMappingFile', 'UpdateLogicalMappings', 'files'),

        /* src/backend/replication/logical/tablesync.c */
        variable('SubscriptionRelState', 'process_syncing_tables_for_apply', 'table_states_not_ready'),
        variable('SubscriptionRelState', 'FetchTableStates', 'rstates'),

        /* src/backend/replication/logical/worker.c */
        variable('LogicalRepRelMapEntry', 'apply_handle_truncate', 'remote_rels'),
        variable('RelationData', 'apply_handle_truncate', 'part_rels'),
        variable('RelationData', 'apply_handle_truncate', 'rels'),
        variable('LogicalRepWorker', 'AtEOXact_LogicalRepWorkers', 'workers'),

        /* src/backend/replication/pgoutput/pgoutput.c */
        variable('Publication', 'pgoutput_row_filter_init', 'publications'),
        variable('Publication', 'pgoutput_column_list_init', 'publications'),
        variable('char', 'LoadPublications', 'pubnames'),
        member('Publication', 'PGOutputData', 'publications'),
        member('Publication', 'PGOutputData', 'publication_names'),

        /* src/backend/rewrite/rewriteHandler.c */
        variable('RewriteRule', 'rewriteValuesRTE', 'locks'),
        variable('RewriteRule', 'fireRIRrules', 'locks'),
        variable('RewriteRule', 'fireRules', 'locks'),
        variable('rewrite_event', 'RewriteQuery', 'rewrite_events'),
        variable('RewriteRule', 'matchLocks', 'matching_locks'),

        /* src/backend/rewrite/rowsecurity.c */
        member('RowSecurityPolicy', 'RowSecurityDesc', 'policies'),
        variable('RowSecurityPolicy', 'add_security_quals', 'permissive_policies'),
        variable('RowSecurityPolicy', 'add_security_quals', 'restrictive_policies'),
        variable('RowSecurityPolicy', 'add_with_check_options', 'permissive_policies'),
        variable('RowSecurityPolicy', 'add_with_check_options', 'restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'update_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'update_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'select_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'select_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'conflict_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'conflict_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'conflict_select_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'conflict_select_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_update_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_update_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_delete_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_delete_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_insert_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_insert_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_select_permissive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'merge_select_restrictive_policies'),
        variable('RowSecurityPolicy', 'get_row_security_policies', 'hook_policies'),

        /* src/backend/statistics/extended_stats.c */
        variable('StatExtEntry', 'BuildRelationExtStatistics', 'statslist'),
        variable('StatExtEntry', 'ComputeExtStatisticsRows', 'lstats'),
        variable('StatExtEntry', 'fetch_statentries_for_relation', 'result'),

        /* src/backend/storage/file/fd.c */
        variable('char', 'check_debug_io_direct', 'elemlist'),

        /* src/backend/storage/file/sharedfileset.c */
        variable('SharedFileSet', 'SharedFileSetUnregister', 'filesetlist'),
        variable('SharedFileSet', 'SharedFileSetInit', 'filesetlist'),
        variable('SharedFileSet', 'SharedFileSetDeleteOnProcExit', 'filesetlist'),

        /* src/backend/storage/ipc/standby.c */
        variable('xl_standby_lock', 'StandbyReleaseLockList', 'locks'),
        member('xl_standby_lock', 'RecoveryLockListsEntry', 'locks'),

        /* src/backend/storage/lmgr/lmgr.c */
        variable('LOCKTAG', 'WaitForLockersMultiple', 'locktags'),
        variable('VirtualTransactionId', 'WaitForLockersMultiple', 'holders'),

        /* src/backend/storage/sync/sync.c */
        variable('PendingUnlinkEntry', 'SyncPostCheckpoint', 'pendingUnlinks'),
        variable('PendingUnlinkEntry', 'RememberSyncRequest', 'pendingUnlinks'),

        /* src/backend/tcop/backend_startup.c */
        variable('const char', 'SendNegotiateProtocolVersion', 'unrecognized_protocol_options'),
        variable('const char', 'ProcessStartupPacket', 'unrecognized_protocol_options'),

        /* src/backend/tcop/postgres.c */
        variable('char', 'check_restrict_nonsystem_relation_kind', 'elemlist'),
        variable('char', 'PostgresMain', 'guc_names'),
        variable('char', 'PostgresMain', 'guc_values'),

        /* src/backend/tsearch/wparser_def.c */
        variable('ExecPhraseData', 'hlCover', 'locations'),
        variable('ExecPhraseData', 'mark_hl_fragments', 'locations'),
        variable('ExecPhraseData', 'prsd_headline', 'locations'),

        /* src/backend/utils/adt/hbafuncs.c */
        variable('TokenizedAuthLine', 'fill_hba_view', 'hba_lines'),
        variable('TokenizedAuthLine', 'fill_ident_view', 'ident_lines'),
        variable('char', 'fill_hba_line', 'names'),

        /* src/backend/utils/adt/jsonb_gin.c */
        variable('JsonPathGinNode', 'make_jsp_expr_node_args', 'args'),
        variable('JsonPathGinNode', 'extract_jsp_path_expr', 'nodes'),
        variable('JsonPathGinNode', 'extract_jsp_path_expr_nodes', 'nodes'),
        variable('JsonPathGinNode', 'jsonb_ops__extract_nodes', 'nodes'),
        variable('JsonPathGinNode', 'jsonb_path_ops__extract_nodes', 'nodes'),

        /* src/backend/utils/adt/jsonpath_exec.c */
        variable('JsonPathVariable', 'GetJsonPathVar', 'vars'),
        member('JsonValue', 'JsonValueList', 'list'),

        /* src/backend/utils/adt/regproc.c */
        variable('char', 'stringToQualifiedNameList', 'namelist'),

        /* src/backend/utils/adt/ruleutils.c */
        variable('char', 'pg_get_functiondef', 'namelist'),
        variable('deparse_namespace', 'set_rtable_names', 'parent_namespaces'),
        variable('deparse_namespace', 'set_deparse_for_query', 'parent_namespaces'),
        member('char', 'deparse_namespace', 'rtable_names'),
        member('char', 'deparse_namespace', 'using_names'),
        member('deparse_columns', 'deparse_namespace', 'rtable_columns'),
        member('char', 'deparse_columns', 'parentUsing'),
        member('char', 'deparse_columns', 'usingNames'),
        member('deparse_namespace', 'deparse_context', 'namespaces'),
        variable('deparse_namespace', 'generate_relation_name', 'namespaces'),
        variable('deparse_namespace', 'get_query_def', 'parentnamespace'),
        variable('deparse_namespace', 'get_name_for_var_field', 'parent_namespaces'),

        /* src/backend/utils/adt/selfuncs.c */
        variable('GroupVarInfo', 'add_unique_group_var', 'varinfos'),
        variable('GroupVarInfo', 'estimate_num_groups', 'varinfos'),
        variable('GroupVarInfo', 'estimate_num_groups', 'relvarinfos'),
        variable('GroupVarInfo', 'estimate_num_groups', 'newvarinfos'),

        /* src/backend/utils/adt/tsquery.c */
        member('QueryItem', 'TSQueryParserStateData', 'polstr'),

        /* src/backend/utils/adt/tsvector_op.c */
        variable('ExecPhraseData', 'TS_execute_locations_recurse', 'llocations'),
        variable('ExecPhraseData', 'TS_execute_locations_recurse', 'rlocations'),

        /* src/backend/utils/adt/varlena.c */
        variable('char', 'textToQualifiedNameList', 'namelist'),

        /* src/backend/utils/adt/xml.c */
        variable('TupleDescData', 'map_sql_typecoll_to_xmlschema_types', 'tupdesc_list'),
        variable('TupleDescData', 'schema_to_xmlschema_internal', 'tupdesc_list'),
        variable('TupleDescData', 'database_to_xmlschema_internal', 'tupdesc_list'),
        variable('char', 'xmlelement', 'arg_strings'),
        variable('char', 'xmlelement', 'named_arg_strings'),

        /* src/backend/utils/cache/catcache.c */
        variable('CatCTup', 'SearchCatCacheList', 'ctlist'),

        /* src/backend/utils/cache/relcache.c */
        variable('RelationData', 'RelationCacheInvalidate', 'rebuildFirstList'),
        variable('RelationData', 'RelationCacheInvalidate', 'rebuildList'),

        /* src/backend/utils/error/elog.c */
        variable('char', 'check_log_destination', 'elemlist'),
        
        /* src/backend/utils/fmgr/fmgr.c */
        member('char', 'fmgr_security_definer_cache', 'configNames'),
        member('char', 'fmgr_security_definer_cache', 'configValues'),

        /* src/backend/utils/init/miscinit.c */
        variable('char', 'UnlinkLockFiles', 'lock_files'),
        variable('char', 'TouchSocketLockFiles', 'lock_files'),
        variable('char', 'load_libraries', 'elemlist'),
        variable('char', 'process_preload_libraries', 'elemlist'),

        /* src/backend/utils/init/postinit.c */
        member('char', 'Port', 'guc_options'),
        
        /* src/backend/utils/mb/mbutils.c */
        variable('ConvProcInfo', 'PrepareClientEncoding', 'ConvProcList'),
        variable('ConvProcInfo', 'SetClientEncoding', 'ConvProcList'),

        /* src/backend/utils/misc/guc.c */
        variable('const char', 'assignable_custom_variable_name', 'reserved_class_prefix'),
        variable('char', 'check_wal_consistency_checking', 'elemlist'),
        variable('char', 'check_log_destination', 'elemlist'),
        variable('char', 'assign_log_destination', 'elemlist'),

        /* src/backend/utils/misc/queryenvironment.c */
        member('EphemeralNamedRelation', 'QueryEnvironment', 'namedRelList'),

        /* src/backend/utils/time/snapmgr.c */
        variable('ExportedSnapshot', 'AtEOXact_Snapshot', 'exportedSnapshots'),

        /* src/pl/plpgsql/src/plpgsql.h */
        member('PLpgSQL_exception', 'PLpgSQL_exception_block', 'exc_list'),
        member('PLpgSQL_diag_item', 'PLpgSQL_stmt_getdiag', 'diag_items'),
        member('PLpgSQL_if_elsif', 'PLpgSQL_stmt_if', 'elsif_list'),
        member('PLpgSQL_case_when', 'PLpgSQL_stmt_case', 'case_when_list'),
        member('PLpgSQL_raise_option', 'PLpgSQL_stmt_raise', 'options'),
        member('PLpgSQL_expr', 'PLpgSQL_stmt_return_query', 'params'),
        member('PLpgSQL_expr', 'PLpgSQL_stmt_open', 'params'),
        member('PLpgSQL_expr', 'PLpgSQL_stmt_raise', 'params'),
        member('PLpgSQL_raise_option', 'PLpgSQL_stmt_raise', 'options'),
        member('PLpgSQL_expr', 'PLpgSQL_stmt_dynexecute', 'params'),
        member('PLpgSQL_expr', 'PLpgSQL_stmt_dynfors', 'params'),

        /* src/pl/plpgsql/src/pl_exec.c */
        variable('PLpgSQL_stmt', 'exec_stmts', 'stmts'),
        variable('PLpgSQL_expr', 'exec_eval_using_params', 'params'),

        /* src/pl/plpgsql/src/pl_funcs.c */
        variable('PLpgSQL_stmt', 'free_stmts', 'stmts'),

        /* src/pl/plpgsql/src/pl_handler.c */
        variable('char', 'plpgsql_extra_checks_check_hook', 'elemlist'),

        /* src/pl/tcl/pltcl.c */
        variable('char', 'pltcl_SPI_prepare', 'names'),

        /* src/test/modules/injection_points/injection_points.c */
        variable('char', 'injection_points_cleanup', 'inj_list_local'),
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

/* 
 * 
 * Computed like this:
 * 
 *     type->field:
 *        - ind1 = (path->path->path)[ind1 - (indexDelta ?? 0)]
 *        - ind2 = (path->path->path)[ind2 - (indexDelta ?? 0)]
 *        - ind3 = (path->path->path)[ind3 - (indexDelta ?? 0)]
 */
export interface BitmapsetReference {
    /* 
     * Type in which this Bitmapset stored.
     */
    type: string;
    /* 
     * Field name of this Bitmapset member
     */
    field: string;
    /* 
     * Paths to fields to which this bitmapset refers.
     * Examined starting from PlannerInfo.
     */
    paths: {
        /*
         * One of possible paths to referer  
         */
        path: string[],
        /* 
         * Delta to apply to result number for element in set.
         * Useful i.e. for rtable index in RelOptInfo->relids.
         * By default (not set) - 0
         */
        indexDelta?: number;
    }[];

    /* 
     * From which element search should be started (accessing via `paths').
     *  'PlannerInfo' - search in parents until reach 'PlannerInfo'
     *                  (PlannerInfo->...->elem->bms - search PlannerInfo's fields)
     *  'Parent' - from direct parent of containing element 
     *             (parent-elem->bms - search parent's fields)
     *  'Self' - search directly in containing element
     *           (elem->bms - search in elem's fields)
     */
    start?: 'PlannerInfo' | 'Parent' | 'Self' ;
}

export function getWellKnownBitmapsetReferences(): [string, BitmapsetReference][] {
    const pathToRangeTable = ['parse', 'rtable'];
    const pathToRelOptInfos = ['simple_rel_array'];
    const pathToRteAndRelOptInfos =  [{path: pathToRangeTable, indexDelta: -1}, 
                                      {path: pathToRelOptInfos}];
    const ref = (type: string, field: string, 
                 paths: {path: string[], indexDelta?: number}[],
                 start?: 'PlannerInfo' | 'Parent' | 'Self'): [string, BitmapsetReference] => 
                    [ field, { type, field, paths, start } ];
    
    return [
        ref('RelOptInfo', 'relids', pathToRteAndRelOptInfos),
        ref('RelOptInfo', 'eclass_indexes', [{path: ['eclasses']}]),
        ref('RelOptInfo', 'nulling_relids', pathToRteAndRelOptInfos),
        ref('RelOptInfo', 'direct_lateral_relids', pathToRteAndRelOptInfos),
        ref('RelOptInfo', 'lateral_relids', pathToRteAndRelOptInfos),
        ref('RelOptInfo', 'lateral_referencers', pathToRteAndRelOptInfos),
        ref('RelOptInfo', 'top_parent_relids', pathToRteAndRelOptInfos),
        ref('RelOptInfo', 'live_parts', [{path: ['part_rels']}], 'Self'),
        ref('RelOptInfo', 'all_partrels', pathToRteAndRelOptInfos),
        
        ref('JoinDomain', 'jd_relids', pathToRteAndRelOptInfos),
        
        ref('EquivalenceClass', 'ec_relids', pathToRteAndRelOptInfos),

        ref('EquivalenceMember', 'em_relids', pathToRteAndRelOptInfos),

        ref('PlannerInfo', 'all_baserels', pathToRteAndRelOptInfos, 'Self'),
        ref('PlannerInfo', 'outer_join_rels', pathToRteAndRelOptInfos, 'Self'),
        ref('PlannerInfo', 'all_query_rels', pathToRteAndRelOptInfos, 'Self'),
        ref('PlannerInfo', 'all_result_relids', pathToRteAndRelOptInfos, 'Self'),
        ref('PlannerInfo', 'leaf_result_relids', pathToRteAndRelOptInfos, 'Self'),
        ref('PlannerInfo', 'curOuterRels', pathToRteAndRelOptInfos, 'Self'),

        ref('ParamPathInfo', 'ppi_req_outer', pathToRteAndRelOptInfos),

        ref('RestrictInfo', 'required_relids', pathToRteAndRelOptInfos),
        ref('RestrictInfo', 'clause_relids', pathToRteAndRelOptInfos),
        ref('RestrictInfo', 'incompatible_relids', pathToRteAndRelOptInfos),
        ref('RestrictInfo', 'outer_relids', pathToRteAndRelOptInfos),
        ref('RestrictInfo', 'left_relids', pathToRteAndRelOptInfos),
        ref('RestrictInfo', 'right_relids', pathToRteAndRelOptInfos),

        ref('PlaceHolderVar', 'phrelds', pathToRteAndRelOptInfos),
        ref('PlaceHolderVar', 'phnullingrels', pathToRteAndRelOptInfos),

        ref('SpecialJoinInfo', 'min_lefthand', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'min_righthand', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'syn_lefthand', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'syn_righthand', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'compute_above_l', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'compute_above_r', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'compute_below_l', pathToRteAndRelOptInfos),
        ref('SpecialJoinInfo', 'compute_below_r', pathToRteAndRelOptInfos),

        ref('RowIdentifyVarInfo', 'rowidrels', pathToRteAndRelOptInfos),

        ref('PlaceHolderInfo', 'ph_evalat', pathToRteAndRelOptInfos),
        ref('PlaceHolderInfo', 'ph_lateral', pathToRteAndRelOptInfos),
        ref('PlaceHolderInfo', 'ph_needed', pathToRteAndRelOptInfos),

        ref('JoinPathExtraData', 'param_source_rels', pathToRteAndRelOptInfos),

        ref('PlannedStmt', 'rewindPlanIDs', [{path: ['subplans']}], 'Self'),

        ref('ModifyTable', 'fdwDirectModifyPlans', [{path: ['resultRelations']}], 'Self'),
        
        ref('Append', 'apprelids', pathToRteAndRelOptInfos),
        ref('MergeAppend', 'apprelids', pathToRteAndRelOptInfos),

        ref('ForeignScan', 'fs_relids', pathToRteAndRelOptInfos),
        ref('ForeignScan', 'fs_base_relids', pathToRteAndRelOptInfos),

        ref('CustomScan', 'custom_relids', pathToRteAndRelOptInfos),

        ref('Var', 'varnullingrels', pathToRteAndRelOptInfos),

        ref('AppendState', 'as_asyncplans', [{path: ['as_asyncrequests']}], 'Self'),
        ref('AppendState', 'as_needrequest', [{path: ['as_asyncrequests']}], 'Self'),
        ref('AppendState', 'as_valid_subplans', [{path: ['as_asyncrequests']}], 'Self'),
        ref('AppendState', 'as_valid_asyncplans', [{path: ['as_asyncrequests']}], 'Self'),

        ref('MergeAppendState', 'ms_valid_subplans', [{path: ['mergeplans']}], 'Self'),
    ]
}
