import { BitmaskMemberInfo,
         HtabEntryInfo,
         ListPtrSpecialMemberInfo,
         SimplehashEntryInfo,
} from "./variables";

class Lazy<T> {
    value: T | undefined;
    factory: () => T;
    constructor(factory: () => T) {
        this.factory = factory;
    }

    get() {
        return this.value ??= this.factory();
    }
}

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
        'ATAlterConstraint',
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
        'MemoryContextData',
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
        'OnConflictClause',
        'OnConflictExpr',
        'OnConflictSetState',
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
        'ReturningClause',
        'ReturningExpr',
        'ReturningOption',
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
        'SupportRequestModifyInPlace',
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
        'UniqueRelInfo',
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
    ];
};

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
        'Var',
        'WindowFunc',
        'WindowFuncFuncCondition',
        'XmlExpr',

        /* This is actually not Expr, but handy to see representation */
        'PlaceHolderVar',
    ];
};

export function getKnownCustomListPtrs(): ListPtrSpecialMemberInfo[] {
    const member = (type: string, struct: string, member: string): ListPtrSpecialMemberInfo => ({
        type: type + ' *',
        member: [struct, member],
    });

    const variable = (type: string, func: string, variable: string): ListPtrSpecialMemberInfo => ({
        type: type + ' *',
        variable: [func, variable],
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
        member('reduce_outer_joins_state', 'reduce_outer_joins_state', 'sub_states'),
        member('reduce_outer_joins_pass1_state', 'reduce_outer_joins_pass1_state', 'sub_states'),
        member('reduce_outer_joins_partial_state', 'reduce_outer_joins_pass2_state', 'sub_states'),

        /* src/include/nodes/pathnodes.h */
        member('MergeScanSelCache', 'RestrictInfo', 'scansel_cache'),

        /* src/backend/utils/cache/lsyscache.c */
        variable('OpBtreeInterpretation', 'get_op_btree_interpretation', 'result'),

        /* src/backend/utils/cache/typcache.c */
        {
            type: 'struct tupleDesc *',
            member: ['RecordCacheEntry', 'tupdescs'],
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
    ];
};

/**
 * Return array of known Node `typedef's.
 * First element is alias and second is type.
 * 
 * @returns Array of pairs: alias -> type
 */
export function getDefaultAliases(): [string, string][] {
    /*
     * Frequently used pattern, where struct ends with 'Data' and
     * typedef is a pointer named without that 'Data' suffix, i.e.
     * 
     *    typedef RelationData *Relation;
     * 
     */
    const addDataSuffix = (alias: string): [string, string] => [alias, `${alias}Data *`];

    return [
        ['Relids', 'Bitmapset *'],
        ['Form_pg_trigger', 'FormData_pg_trigger *'],
        ['CheckpointerShmem', 'CheckpointerShmemStruct *'],

        ...[
            'MemoryContext',
            'HeapTupleHeader',
            'XLogPageHeader',
            'PageHeader',
            'XLogPageHeader',
            'SpGistPageOpaque',
            'GinPageOpaque',
            'IndexTuple',
            'HashPageOpaque',
            'BTPageOpaque',
            'Portal',
            'AfterTriggerEvent',
            'TableScanDesc',
            'IndexScanDesc',
            'ScanKey',
            'TwoPhaseState',
            'BTVacuumPosting',
            'MultiSortSupport',
            'TSVector',
            'BTVacuumPosting',
            'SetConstraintState',
            'ParamListInfo',
        ].map(addDataSuffix),
    ] as [string, string][];
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
        lengthExpr,
    });

    return [
        /* src/include/nodes/pathnodes.h */
        _('PlannerInfo', 'simple_rel_array', 'simple_rel_array_size'),
        _('PlannerInfo', 'simple_rte_array', 'simple_rel_array_size'),
        _('PlannerInfo', 'append_rel_array', 'simple_rel_array_size'),
        _('PlannerInfo', 'placeholder_array', 'placeholder_array_size'),
        _('PlannerInfo', 'join_rel_level', 'join_cur_level'),

        _('RelOptInfo', 'part_rels', 'nparts'),
        _('RelOptInfo', 'partexprs', 'part_scheme->partnatts'),
        _('RelOptInfo', 'nullable_partexprs', 'part_scheme->partnatts'),
        _('RelOptInfo', 'attr_needed', '!{}->max_attr - {}->min_attr + 1'),
        _('RelOptInfo', 'attr_widths', '!{}->max_attr - {}->min_attr + 1'),

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

        _('PathTarget', 'sortgrouprefs', 'exprs'),

        _('AppendRelInfo', 'parent_colnos', 'num_child_cols'),

        _('PartitionScheme', 'partopfamily', 'partnatts'),
        _('PartitionScheme', 'partopcintype', 'partnatts'),
        _('PartitionScheme', 'partcollation', 'partnatts'),
        _('PartitionScheme', 'parttyplen', 'partnatts'),
        _('PartitionScheme', 'parttypbyval', 'partnatts'),

        /* src/include/nodes/execnodes.h */
        _('ResultRelInfo', 'ri_IndexRelationInfo', 'ri_NumIndices'),
        _('ResultRelInfo', 'ri_TrigWhenExprs', 'ri_TrigDesc->numtriggers'),
        _('ResultRelInfo', 'ri_Slots', 'ri_NumSlots'),
        _('ResultRelInfo', 'ri_PlanSlots', 'ri_NumSlots'),
        _('ResultRelInfo', 'ri_ConstraintExprs', 'ri_RelationDesc->rd_att->natts'),
        _('ResultRelInfo', 'ri_GeneratedExprsI', 'ri_NumGeneratedNeededI'),
        _('ResultRelInfo', 'ri_GeneratedExprsU', 'ri_NumGeneratedNeededU'),

        _('IndexInfo', 'ii_ExclusionOps', 'ii_NumIndexKeyAttrs'),
        _('IndexInfo', 'ii_ExclusionProcs', 'ii_NumIndexKeyAttrs'),
        _('IndexInfo', 'ii_ExclusionStrats', 'ii_NumIndexKeyAttrs'),
        /* 
         * Not sure about these:
         * 
         * _('IndexInfo', 'ii_UniqueOps', 'ii_NumIndexKeyAttrs'),
         * _('IndexInfo', 'ii_UniqueProcs', 'ii_NumIndexKeyAttrs'),
         * _('IndexInfo', 'ii_UniqueStrats', 'ii_NumIndexKeyAttrs'),
         */

        _('EState', 'es_rowmarks', 'es_range_table_size'),
        _('EState', 'es_relations', 'es_range_table_size'),
        _('EState', 'es_result_relations', 'es_range_table_size'),

        _('EPQState', 'relsubs_slot', 'parentestate->es_range_table_size'),
        _('EPQState', 'relsubs_rowmark', 'parentestate->es_range_table_size'),
        _('EPQState', 'relsubs_done', 'parentestate->es_range_table_size'),
        _('EPQState', 'relsubs_blocked', 'parentestate->es_range_table_size'),

        _('ProjectSetState', 'elems', 'nelems'),
        _('ProjectSetState', 'elemdone', 'nelems'),

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

        _('IndexArrayKeyInfo', 'elem_values', 'num_elems'),
        _('IndexArrayKeyInfo', 'elem_nulls', 'num_elems'),

        _('JunkFilter', 'jf_cleanMap', 'jf_cleanTupType->natts'),

        _('TupleHashTableData', 'keyColIdx', 'numCols'),
        _('TupleHashTableData', 'tab_collations', 'numCols'),

        _('SubPlanState', 'keyColIdx', 'numCols'),
        _('SubPlanState', 'tab_eq_funcoids', 'numCols'),
        _('SubPlanState', 'tab_collations', 'numCols'),
        _('SubPlanState', 'tab_hash_funcs', 'numCols'),
        _('SubPlanState', 'tag_eq_funcs', 'numCols'),
        _('SubPlanState', 'lhs_hash_funcs', 'numCols'),
        _('SubPlanState', 'cur_eq_funcs', 'numCols'),
        _('SubPlanState', 'cross_eq_funcoids', 'numCols'),

        _('IndexScanState', 'iss_ReachedEnd', 'iss_NumOrderByKeys'),
        _('IndexScanState', 'iss_OrderByValues', 'iss_NumOrderByKeys'),
        _('IndexScanState', 'iss_OrderByNulls', 'iss_NumOrderByKeys'),
        _('IndexScanState', 'iss_SortSupport', 'iss_NumOrderByKeys'),
        _('IndexScanState', 'iss_OrderByTypByVals', 'iss_NumOrderByKeys'),
        _('IndexScanState', 'iss_OrderByTypLens', 'iss_NumOrderByKeys'),

        _('IndexOnlyScanState', 'ioss_ScanKeys', 'ioss_NumScanKeys'),
        _('IndexOnlyScanState', 'ioss_OrderByKeys', 'ioss_NumOrderByKeys'),
        _('IndexOnlyScanState', 'ioss_RuntimeKeys', 'ioss_NumRuntimeKeys'),
        _('IndexOnlyScanState', 'ioss_NameCStringAttNums', 'ioss_NameCStringCount'),

        _('BitmapIndexScanState', 'biss_ScanKeys', 'biss_NumScanKeys'),
        _('BitmapIndexScanState', 'biss_RuntimeKeys', 'biss_NumRuntimeKeys'),
        _('BitmapIndexScanState', 'biss_ArrayKeys', 'biss_NumArrayKeys'),

        _('TidScanState', 'tss_TidList', 'tss_NumTids'),

        _('ValuesScanState', 'exprlists', 'array_len'),
        _('ValuesScanState', 'exprstatelists', 'array_len'),

        _('MergeJoinState', 'mj_Clauses', 'mj_NumClauses'),

        _('MemoizeState', 'param_exprs', 'nkeys'),
        _('MemoizeState', 'collations', 'nkeys'),
        _('MemoizeState', 'hashfunctions', 'nkeys'),

        _('AggState', 'aggcontexts', 'maxsets'),
        _('AggState', 'pergroups', 'maxsets'),
        _('AggState', 'hash_spills', 'num_hashes'),

        _('GatherState', 'reader', 'nreaders'),

        _('GatherMergeState', 'gm_slots', 'nreaders + 1'),
        _('GatherMergeState', 'reader', 'nreaders'),

        _('AggStatePerTransData', 'sortstates', 'maxsets'),

        _('AggStatePerPhaseData', 'gset_lengths', 'numsets'),
        _('AggStatePerPhaseData', 'grouped_cols', 'numsets'),
        _('AggStatePerPhaseData', 'eqfunctions', 'numsets'),

        _('ExprState', 'steps', 'steps_len'),

        _('AppendState', 'as_pstate', 'pstate_len'),

        /* src/include/nodes/plannodes.h */
        _('MergeAppend', 'sortColIdx', 'numCols'),
        _('MergeAppend', 'sortOperators', 'numCols'),
        _('MergeAppend', 'collations', 'numCols'),
        _('MergeAppend', 'nullsFirst', 'numCols'),

        _('RecursiveUnion', 'dupColIdx', 'numCols'),
        _('RecursiveUnion', 'dupOperators', 'numCols'),
        _('RecursiveUnion', 'dupCollations', 'numCols'),

        _('MergeJoin', 'mergeFamilies', '!list_length({}->mergeclauses)'),
        _('MergeJoin', 'mergeCollations', '!list_length({}->mergeclauses)'),
        _('MergeJoin', 'mergeStrategies', '!list_length({}->mergeclauses)'),
        _('MergeJoin', 'mergeNullsFirst', '!list_length({}->mergeclauses)'),

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

        /* src/include/access/session.h */
        _('Session', 'steps', 'nsteps'),

        /* src/include/access/relscan.h */
        _('TableScanDescData', 'rs_key', 'rs_nkeys'),
        _('IndexScanDescData', 'keyData', 'numberOfKeys'),
        _('IndexScanDescData', 'orderByData', 'numberOfOrderKeys'),

        /* src/include/access/gist_private.h */
        _('GISTBuildBuffers', 'buffersOnLevels', 'buffersOnLevelsLen'),
        _('GISTBuildBuffers', 'loadedBuffers', 'loadedBuffersCount'),
        
        /* src/include/access/brin_internal.h */
        _('BrinDesc', 'bd_info', 'bd_tupdesc->natts'),
        
        /* src/include/access/gist.h */
        _('GistEntryVector', 'vector', 'n'),

        /* src/include/access/gistxlog.h */
        _('gistxlogDelete', 'offsets', 'ntodelete'),
        
        /* src/include/access/heapam_xlog.h */
        _('xl_heap_truncate', 'relids', 'nrelids'),
        
        _('xl_heap_mutli_insert', 'offsets', 'ntuples'),
        
        _('xlhp_freeze_plans', 'plans', 'nplans'),

        _('xlhp_prune_items', 'data', 'ntargets'),
        
        _('xl_heap_inplace', 'msgs', 'nmsgs'),
        
        /* src/include/access/hash_xlog.h */
        _('xl_hash_vacuum_one_page', 'offsets', 'ntuples'),
        
        /* src/include/access/multixact.h */
        _('xl_multixact_create', 'members', 'nmembers'),
        
        /* src/include/access/nbtree.h */
        _('BTVacuumPostingData', 'deletetids', 'ndeletedtids'),
        
        /* src/include/access/spgxlog.h */
        _('spgxlogMoveLeafs', 'offsets', 'nMoves'),
        
        _('spgxlogVacuumRoot', 'offsets', 'nDelete'),
        
        _('spgxlogVacuumLeaf', 'offsets', '!{}->nDead + {}->nPlaceholder + {}->nMove * 2 + {}->nChain * 2'),
        
        _('spgxlogVacuumRedirect', 'offsets', 'nToPlaceholder'),
        
        /*
         * spgxlogPickSplit is not supported, because it contains elements
         * of different types (OffsetNumber + uint8)
         */
        
        /* src/include/access/tupdesc.h */
        _('TupleDescData', 'attrs', 'natts'),
        
        _('TupleDescData', 'compact_attrs', 'natts'),
        
        /* src/include/access/xact.h */
        _('xl_xact_assignment', 'xsub', 'nsubxacts'),
        
        _('xl_xact_subxacts', 'subxacts', 'nsubxacts'),
        
        _('xl_xact_relfilenodes', 'xnodes', 'nrels'),
        
        _('xl_xact_relfilelocators', 'xlocators', 'nrels'),
        
        _('xl_xact_stats_items', 'items', 'nitems'),
        
        _('xl_xact_invals', 'msgs', 'nmsgs'),
        
        /* src/include/access/xlogreader.h */
        _('DecodedXLogRecord', 'blocks', 'max_block_id + 1'),
        
        /* src/include/catalog/namespace.h */
        _('FuncCandidateList', 'args', 'nargs'),
        
        /* src/include/commands/dbcommands_xlog.h */
        _('xl_dbase_drop_rec', 'tablespace_ids', 'ntablespaces'),
        
        /* src/include/executor/execPartition.h */
        _('PartitionRelPruningData', 'partrelprunedata', 'num_partrelprunedata'),
        
        _('PartitionPruningData', 'partrelprunedata', 'num_partrelprunedata'),
        
        /* src/include/jit/jit.h */
        _('SharedJitInstrumentation', 'jit_instr', 'num_workers'),
        
        /* src/include/executor/instrument.h */
        _('WorkerInstrumentation', 'instrument', 'num_workers'),
        
        /* src/include/fe_utils/parallel_slot.h */
        _('ParallelSlotArray', 'slots', 'numslots'),
        
        /* src/include/nodes/execnodes.h */
        _('SharedMemoizeInfo', 'sinstrument', 'num_workers'),
        
        _('SharedSortInfo', 'sinstrument', 'num_workers'),
        
        _('SharedIncrementalSortInfo', 'sinfo', 'num_workers'),
        
        _('SharedAggInfo', 'sinstrument', 'num_workers'),

        _('SharedHashInfo', 'hinstrument', 'num_workers'),
        
        /* src/include/nodes/params.h */
        _('ParamListInfoData', 'params', 'numParams'),
        
        /* src/include/nodes/tidbitmap.h */
        _('TBMIterateResult', 'offsets', 'ntuples'),
        
        /* src/include/statistics/extended_stats_internal.h */
        _('MultiSortSupportData', 'ssup', 'ndims'),
        
        _('SortItem', 'values', 'count'),
        _('SortItem', 'isnull', 'count'),
        
        /* src/include/statistics/statistics.h */
        _('MVNDistinct', 'items', 'nitems'),
        
        _('MVDependency', 'deps', 'ndeps'),
        _('MVDependency', 'attributes', 'nattributes'),

        _('MVDependencies', 'deps', 'ndeps'),

        _('MCVList', 'items', 'nitems'),
        
        /* src/include/storage/standbydefs.h */
        _('xl_standby_locks', 'locks', 'nlocks'),
        
        _('xl_running_xacts', 'xids', 'xcnt'),
        
        _('xl_invalidations', 'msgs', 'nsmgs'),
        
        /* src/include/tsearch/ts_type.h */
        _('WordEntryPosVector', 'pos', 'npos'),
        
        /* src/include/tsearch/dicts/spell.h */
        _('SPNode', 'data', 'length'),
        
        /* src/include/utils/catcache.h */
        _('CatCList', 'members', 'n_members'),
        
        /* src/include/utils/datetime.h */
        _('TimeZoneAbbrevTable', 'abbrevs', 'numabbrevs'),
        
        /* src/include/utils/geo_decls.h */
        _('PATH', 'p', 'npts'),
        _('POLYGON', 'p', 'npts'),

        /* src/include/executor/execParallel.h */
        _('ParallelExecutorInfo', 'reader', 'pcxt->nworkers_launched'),
        _('ParallelExecutorInfo', 'tqueue', 'pcxt->nworkers_launched'),

        /* src/include/executor/functions.h */
        _('SQLFunctionParseInfo', 'argnames', 'nargs'),

        /* src/include/executor/hashjoin.h */
        _('HashJoinTableData', 'skewBucket', 'nSkewBuckets'),
        _('HashJoinTableData', 'skewBucketNums', 'nSkewBuckets'),

        /* src/include/utils/rel.h */
        _('RelationData', 'rd_opfamily', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_opcintype', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_indcollation', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_indoption', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_exclops', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_exclprocs', 'rd_index->indnkeyatts'),
        _('RelationData', 'rd_exclstrats', 'rd_index->indnkeyatts'),

        _('ForeignKeyCacheInfo', 'conkey', 'nkeys'),
        _('ForeignKeyCacheInfo', 'confkey', 'nkeys'),
        _('ForeignKeyCacheInfo', 'conpfeqop', 'nkeys'),

        /* src/include/fe_utils/print.h */
        _('printTableContent', 'headers', 'ncolumns + 1'),
        _('printTableContent', 'aligns', 'ncolumns + 1'),

        _('printQueryOpt', 'translate_columns', 'n_translate_columns'),

        /* src/include/optimizer/clauses.h */
        _('WindowFuncLists', 'windowFuncs', 'numWindowFuncs'),

        /* src/include/statistics/extended_stats_internal.h */
        _('StatsBuildData', 'attnums', 'nattnums'),
        _('StatsBuildData', 'stats', 'nattnums'),
        _('StatsBuildData', 'values', 'nattnums'),
        _('StatsBuildData', 'nulls', 'nattnums'),

        /* src/include/partitioning/partbounds.h */
        _('PartitionBoundInfoData', 'datums', 'ndatums'),
        _('PartitionBoundInfoData', 'kind', 'ndatums'),
        _('PartitionBoundInfoData', 'indexes', 'nindexes'),

        /* src/include/partitioning/partprune.h */
        _('PartitionPruneContext', 'partcollation', 'partnatts'),
        _('PartitionPruneContext', 'partcollation', 'partnatts'),

        /* src/include/replication/logicalproto.h */
        _('LogicalRepRelation', 'attnames', 'natts'),
        _('LogicalRepRelation', 'atttyps', 'natts'),

        _('LogicalRepTupleData', 'colvalues', 'ncols'),
        _('LogicalRepTupleData', 'colstatus', 'ncols'),

        /* src/include/access/spgist.h */
        _('spgInnerConsistentOut', 'nodeNumbers', 'nNodes'),
        _('spgInnerConsistentOut', 'levelAdds', 'nNodes'),
        _('spgInnerConsistentOut', 'reconstructedValues', 'nNodes'),
        _('spgInnerConsistentOut', 'distances', 'nNodes'),

        /* src/include/rewrite/prs2lock.h */
        _('RuleLock', 'rules', 'numLocks'),
        
        /* src/backend/access/transam/multixact.c */
        _('mXactCacheEnt', 'members', 'nmembers'),
        
        /* src/backend/access/transam/twophase.c */
        _('TwoPhaseStateData', 'prepXacts', 'numPrepXacts'),
        
        /* src/backend/access/transam/xact.c */
        _('SerializedTransactionState', 'parallelCurrentXids', 'nParallelCurrentXids'),
        
        /* src/backend/access/transam/xlogprefetcher.c */
        _('LsnReadQueue', 'queue', 'size'),
        
        /* src/backend/access/nbtree/nbtree.c */
        _('BTVacInfo', 'vacuums', 'num_vacuums'),
        
        /* src/backend/catalog/index.c */
        _('SerializedReindexState', 'pendingReindexedIndexes', 'numPendingReindexedIndexes'),
        
        /* src/backend/commands/tablespace.c */
        _('temp_tablespaces_extra', 'tblSpcs', 'numSpcs'),
        
        /* src/backend/commands/trigger.c */
        _('SetConstraintStateData', 'trigstates', 'numstates'),
        
        /* src/backend/optimizer/plan/setrefs.c */
        _('indexed_tlist', 'vars', 'num_vars'),
        
        /* src/backend/postmaster/bgworker.c */
        _('BackgroundWorkerArray', 'slot', 'total_slots'),
        
        /* src/backend/postmaster/checkpointer.c */
        _('CheckpointerShmemStruct', 'requests', 'num_requests'),
        
        /* src/backend/replication/logical/reorderbuffer.c */
        _('ReorderBufferIterTXNState', 'entries', 'nr_txns'),
        
        /* src/backend/replication/logical/origin.c */
        _('ReplicationStateCtl', 'states', '!max_active_replication_origins'),
        
        /* src/backend/storage/ipc/shm_toc.c */
        _('shm_toc', 'toc_entry', 'toc_nentry'),
        
        /* src/backend/storage/ipc/sinvaladt.c */
        _('SISeg', 'procState', 'numProcs'),
        
        /* src/backend/storage/aio/method_worker.c */
        _('PgAioWorkerControl', 'workers', '!MAX_IO_WORKERS'),
        
        /* src/backend/utils/adt/jsonfuncs.c */
        _('RecordIOData', 'columns', 'ncolumns'),
        
        /* src/backend/utils/adt/rowtypes.c */
        _('RecordCompareData', 'columns', 'ncolumns'),
        
        /* src/backend/utils/adt/tsvector_op.c */
        _('StatEntry', 'lexeme', 'lenlexeme'),
        
        /* src/backend/utils/adt/xid8funcs.c */
        _('pg_snapshot', 'xip', 'nxip'),
        
        /* src/backend/utils/adt/txid.c */
        _('TxidSnapshot', 'xip', 'nxip'),
        
        /* src/backend/utils/adt/jsonb_gin.c */
        /*
         * flm is conditional based on enum value, but CodeLLDB requires
         * special handling of an enum, so here we cast enum to int and
         * handle in such way.
         * I hope that binary compatibility will be preserved in all future
         * versions, at least this part have not changed since original
         * commit in 12 version.
         */
        _('JsonPathGinNode', 'args', '!((int){}->type) == 0 || ((int){}->type) == 1 ? {}->val.nargs : -1'),
        
        /* src/backend/utils/cache/typcache.c */
        _('TypeCacheEnumData', 'enum_values', 'num_values'),
        
        /* src/backend/utils/cache/inval.c */
        _('InvalidationChunk', 'msgs', 'nitems'),
        
        /* src/backend/utils/sort/sharedtuplestore.c */
        _('SharedTuplestore', 'participants', 'nparticipants'),
        
        /* src/backend/utils/sort/tuplesort.c */
        _('Sharedsort', 'tapes', 'nTapes'),

        /* src/interfaces/ecpg/ecpglib/ecpglib_extern.h */
        _('statement', 'paramvalues', 'nparams + 1'),
        _('statement', 'paramlengths', 'nparams + 1'),
        _('statement', 'paramformats', 'nparams + 1'),

        /* src/interfaces/libpq/libpq-int.h */
        _('pg_result', 'tuples', 'ntups'),
        _('pg_result', 'attDescs', 'numAttributes'),
        _('pg_result', 'paramDescs', 'numParameters'),
        _('pg_result', 'events', 'nEvents'),

        _('pg_conn', 'events', 'nEvents'),
        _('pg_conn', 'addr', 'naddr'),

        /* src/pl/plpython/plpy_procedure.h */
        _('PLyProcedure', 'args', 'nargs'),
        _('PLyProcedure', 'argnames', 'nargs'),

        _('PLySavedArgs', 'namedargs', 'nargs'),

        /* src/pl/plpgsql/src/plpgsql.h */
        _('PLpgSQL_row', 'fieldnames', 'nfields'),
        _('PLpgSQL_stmt_block', 'initvarnoss', 'n_initvars'),
        _('PLpgSQL_function', 'datums', 'ndatums'),
        _('PLpgSQL_execstate', 'datums', 'ndatums'),

        /* src/test/isolation/isolationtester.h */
        _('PermutationStepBlocker', 'blockers', 'nblockers'),

        _('Permutation', 'steps', 'nsteps'),

        _('TestSpec', 'setupsqls', 'nsetupsqls'),
        _('TestSpec', 'sessions', 'nsesssions'),
        _('TestSpec', 'permutations', 'npermutations'),

        /* src/bin/pg_upgrade/pg_upgrade.h */
        _('OSInfo', 'old_tablespaces', 'num_old_tablespaces'),
        _('OSInfo', 'libraries', 'num_libraries'),

        /* src/bin/pg_dump/pg_dump.h */
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
        
        _('LoInfo', 'looids', 'numlos'),
        
        /* src/bin/pg_rewind/filemap.h */
        _('filemap_t', 'entries', 'nentries'),
        
        /* src/test/modules/test_shm_mq */
        _('worker_state', 'handle', 'nworkers'),
        
        /* contrib/hstore/hstore_io.c */
        _('RecordIOData', 'columns', 'ncolumns'),
    ];
};

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
    ];
};

export function getWellKnownHTABTypes(): HtabEntryInfo[] {
    const type = (parent: string, member: string, type: string) => ({
        parent, member, type,
    } as HtabEntryInfo);

    return [
        type('PlannerInfo', 'join_rel_hash', 'JoinHashEntry *'),
        type('RewriteStateData', 'rs_unresolved_tups', 'UnresolvedTupData *'),
        type('RewriteStateData', 'rs_old_new_tid_map', 'OldToNewMappingData *'),
        type('TIDBitmap', 'pagetable', 'PagetableEntry *'),
        type('do_autovacuum', 'table_toast_map', 'av_relation *'),
        type('rebuild_database_list', 'dbhash', 'avl_dbase *'),
        type('compute_tsvector_stats', 'lexemes_tab', 'TrackItem *'),
        type('prune_lexemes_hashtable', 'lexemes_tab', 'TrackItem *'),
        type('TupleHashTableData', 'hashtab', 'TupleHashEntryData *'),
        type('plperl_interp_desc', 'query_hash', 'plperl_query_entry *'),
        type('PgStat_StatDBEntry', 'tables', 'PgStat_StatTabEntry *'),
        type('PgStat_StatDBEntry', 'functions', 'PgStat_StatFuncEntry *'),
    ];
};

export function getWellKnownSimpleHashTableTypes(): SimplehashEntryInfo[] {
    const type = (prefix: string, elementType: string, canIterate = true) => ({
        prefix, elementType, canIterate,
    } as SimplehashEntryInfo);

    return [
        type('blockreftable', 'BlockRefTableEntry *'),
        type('filehash', 'file_entry_t *'),
        type('manifest_files', 'manifest_file *'),
        type('memoize', 'MemoizeEntry *'),
        type('pagetable', 'PagetableEntry *'),
        type('pgstat_entry_ref_hash', 'PgStat_EntryRefHashEntry *'),
        type('tuplehash', 'TupleHashEntryData *'),

        /* 
         * These simple hash tables have iteration logic trimmed,
         * but leave it to show, that I hadn't forgotten it.
         */
        type('backup_file', 'backup_file_entry *', false),
        type('catalogid', 'CatalogIdMapEntry *', false),
        type('collation_cache', 'collation_cache_entry *', false),
        type('derives', 'ECDerivesEntry *', false),
        type('keepwal', 'keepwal_entry *', false),
        type('nsphash', 'SearchPathCacheEntry *', false),
        type('pgstat_snapshot', 'PgStat_SnapshotEntry *', false),
        type('rolename', 'RoleNameEntry *', false),
        type('saophash', 'ScalarArrayOpExprHashEntry *', false),
    ];
}

/* Range of supported versions: [start; end) */
export class VersionInterval {
    constructor(public start: number, public end: number) { }
    
    satisfies(version: number) {
        return this.start <= version && version < this.end;
    }

    static Min =          0;
    static Max = 1_00_00_00;
    static Unbounded = new VersionInterval(this.Min, this.Max);
}

/* 
 * Actual array of all bitmask members. Initialized lazily, because
 * we must perform some actions after array is initialized (reverse
 * inner array, reason see above).
 */
function getVersionedFlagMembers() {
    type FlagInfo = [string, string];
    type FieldInfo = [string, [string, string]];
    type VersionedFlagFieldRow = [VersionInterval, FlagInfo[]?, FieldInfo[]?];
    
    /* shortcuts */
    const interval = (start: number, end: number, flags: FlagInfo[], fields?: FieldInfo[]): VersionedFlagFieldRow =>
        [new VersionInterval(start, end), flags, fields];
    const to = (end: number, flags: FlagInfo[], fields?: FieldInfo[]): VersionedFlagFieldRow =>
        [new VersionInterval(VersionInterval.Min, end), flags, fields];
    const from = (start: number, flags: FlagInfo[], fields?: FieldInfo[]): VersionedFlagFieldRow =>
        [new VersionInterval(start, VersionInterval.Max), flags, fields];
    const unbounded = (flags: FlagInfo[], fields?: FieldInfo[]): VersionedFlagFieldRow => 
        [VersionInterval.Unbounded, flags, fields];

    /* Main function to create one bitmask member entry with all verisons */
    const _ = (type: string, member: string,
               entries: [VersionInterval, FlagInfo[]?, FieldInfo[]?][]): [VersionInterval, BitmaskMemberInfo][] => 
        entries.map(([ver, flags, fields]) => [ver, {
            type, member,
            flags: flags?.map(([flag, numeric]) => ({flag, numeric})) ?? [],
            fields: fields?.map(([name, [mask, numeric]]) => ({name, mask, numeric})) ?? [],
        }]);

    /* most commonly used flags are for heap tuple */
    const createInfomaskFlags = (type: string, member: string) => _(type, member, [
        to(8_01_00, [
            ['HEAP_HASNULL', '0x0001'],
            ['HEAP_HASVARWIDTH', '0x0002'],
            ['HEAP_HASEXTERNAL', '0x0004'],
            ['HEAP_HASCOMPRESSED', '0x0008'],
            ['HEAP_HASEXTENDED', '0x000C'],
            ['HEAP_HASOID', '0x0010'],
            ['HEAP_XMAX_UNLOGGED', '0x0080'],
            ['HEAP_XMIN_COMMITTED', '0x0100'],
            ['HEAP_XMIN_INVALID', '0x0200'],
            ['HEAP_XMAX_COMMITTED', '0x0400'],
            ['HEAP_XMAX_INVALID', '0x0800'],
            ['HEAP_UPDATED', '0x2000'],
            ['HEAP_MOVED_OFF', '0x4000'],
            ['HEAP_MOVED_IN', '0x8000'],
            ['HEAP_MARKED_FOR_UPDATE', '0x1000'],
        ]),
        interval(8_01_00, 8_03_00, [
            ['HEAP_HASNULL', '0x0001'],
            ['HEAP_HASVARWIDTH', '0x0002'],
            ['HEAP_HASEXTERNAL', '0x0004'],
            ['HEAP_HASCOMPRESSED', '0x0008'],
            ['HEAP_HASEXTENDED', '0x000C'],
            ['HEAP_HASOID', '0x0010'],
            ['HEAP_XMAX_EXCL_LOCK', '0x0040'],
            ['HEAP_XMAX_SHARED_LOCK', '0x0080'],
            ['HEAP_XMIN_COMMITTED', '0x0100'],
            ['HEAP_XMIN_INVALID', '0x0200'],
            ['HEAP_XMAX_COMMITTED', '0x0400'],
            ['HEAP_XMAX_INVALID', '0x0800'],
            ['HEAP_XMAX_IS_MULTI', '0x1000'],
            ['HEAP_UPDATED', '0x2000'],
            ['HEAP_MOVED_OFF', '0x4000'],
            ['HEAP_MOVED_IN', '0x8000'],
        ]),
        interval(8_03_00, 9_00_00, [
            ['HEAP_HASNULL',			'0x0001'],
            ['HEAP_HASVARWIDTH',		'0x0002'],
            ['HEAP_HASEXTERNAL',		'0x0004'],
            ['HEAP_HASOID',				'0x0008'],
            ['HEAP_COMBOCID',			'0x0020'],
            ['HEAP_XMAX_EXCL_LOCK',		'0x0040'],
            ['HEAP_XMAX_SHARED_LOCK',	'0x0080'],
            ['HEAP_XMIN_COMMITTED',		'0x0100'],
            ['HEAP_XMIN_INVALID',		'0x0200'],
            ['HEAP_XMAX_COMMITTED',		'0x0400'],
            ['HEAP_XMAX_INVALID',		'0x0800'],
            ['HEAP_XMAX_IS_MULTI',		'0x1000'],
            ['HEAP_UPDATED',			'0x2000'],
            ['HEAP_MOVED_OFF',			'0x4000'],
            ['HEAP_MOVED_IN',			'0x8000'],
        ]),
        from(9_00_00, [
            ['HEAP_HASNULL',			'0x0001'],
            ['HEAP_HASVARWIDTH',		'0x0002'],
            ['HEAP_HASEXTERNAL',		'0x0004'],
            ['HEAP_HASOID',				'0x0008'],
            ['HEAP_XMAX_KEYSHR_LOCK',	'0x0010'],
            ['HEAP_COMBOCID',			'0x0020'],
            ['HEAP_XMAX_EXCL_LOCK',		'0x0040'],
            ['HEAP_XMAX_LOCK_ONLY',		'0x0080'],
            ['HEAP_XMIN_COMMITTED',		'0x0100'],
            ['HEAP_XMIN_INVALID',		'0x0200'],
            ['HEAP_XMAX_COMMITTED',		'0x0400'],
            ['HEAP_XMAX_INVALID',		'0x0800'],
            ['HEAP_XMAX_IS_MULTI',		'0x1000'],
            ['HEAP_UPDATED',			'0x2000'],
            ['HEAP_MOVED_OFF',			'0x4000'],
            ['HEAP_MOVED_IN',			'0x8000'],
        ]),
    ]);
    
    const createInfomask2Flags = (type: string, member: string) => _(type, member, [
        interval(8_03_00, 9_00_00, [
            ['HEAP_HOT_UPDATED',		'0x4000'],
            ['HEAP_ONLY_TUPLE',			'0x8000'],
        ], [
            ['natts', ['HEAP_NATTS_MASK', '0x07FF']],
        ]),
        from(9_00_00, [
            ['HEAP_KEYS_UPDATED',		'0x2000'],
            ['HEAP_HOT_UPDATED',		'0x4000'],
            ['HEAP_ONLY_TUPLE',			'0x8000'],
        ], [
            ['natts', ['HEAP_NATTS_MASK', '0x07FF']],
        ]),
    ]);
    
    const createInfobitsFlags = (type: string, member: string) => _(type, member, [
        from(9_00_00, [
            ['XLHL_XMAX_IS_MULTI', '0x01'],
            ['XLHL_XMAX_LOCK_ONLY', '0x02'],
            ['XLHL_XMAX_EXCL_LOCK', '0x04'],
            ['XLHL_XMAX_KEYSHR_LOCK', '0x08'],
            ['XLHL_KEYS_UPDATED', '0x10'],
        ]),
    ]);

    /* 
     * In contrast to other features this one actually requires from us
     * to know which version of PostgreSQL we are running: different set
     * of flags and (possible) flag values.
     * 
     * This is too sensitive, because if flags are shown incorrect, than
     * developer will make the wrong decisions/actions and this is even
     * worse than not displaying flags.
     */
    const bitmasks: [VersionInterval, BitmaskMemberInfo][][] = [
        /* src/include/access/htup_details.h */
        createInfomaskFlags('HeapTupleHeaderData', 't_infomask'),
        createInfomask2Flags('HeapTupleHeaderData', 't_infomask2'),

        createInfomaskFlags('MinimalTupleData', 't_infomask'),
        createInfomask2Flags('MinimalTupleData', 't_infomask2'),

        /* src/include/access/heapam.h */
        createInfomaskFlags('HeapTupleFreeze', 't_infomask'),
        createInfomask2Flags('HeapTupleFreeze', 't_infomask2'),

        /* src/include/access/xlog_internal.h */
        _('XLogPageHeaderData', 'xlp_info', [
            to(9_00_00, [
                ['XLP_FIRST_IS_CONTRECORD', '0x0001'],
                ['XLP_LONG_HEADER', '0x0002'],
            ]),
            interval(9_00_00, 9_06_00, [
                ['XLP_FIRST_IS_CONTRECORD', '0x0001'],
                ['XLP_LONG_HEADER', '0x0002'],
                ['XLP_BKP_REMOVABLE', '0x0004'],
            ]),
            from(9_06_00, [
                ['XLP_FIRST_IS_CONTRECORD', '0x0001'],
                ['XLP_LONG_HEADER', '0x0002'],
                ['XLP_BKP_REMOVABLE', '0x0004'],
                ['XLP_FIRST_IS_OVERWRITE_CONTRECORD', '0x0008'],
            ]),
        ]),

        /* src/include/storage/bufpage.h */
        _('PageHeaderData', 'pd_flags', [
            interval(8_03_00, 8_04_00, [
                ['PD_HAS_FREE_LINES',   '0x0001'],
                ['PD_PAGE_FULL',        '0x0002'],
            ]),
            from(8_04_00, [
                ['PD_HAS_FREE_LINES',   '0x0001'],
                ['PD_PAGE_FULL',        '0x0002'],
                ['PD_ALL_VISIBLE',      '0x0004'],
            ]),
        ]),

        /* src/backend/access/transam/generic_xlog.c */
        _('PageData', 'flags', [
            from(9_00_00, [
                ['GENERIC_XLOG_FULL_IMAGE', '0x0001'],
            ]),
        ]),

        /* src/include/access/skey.h */
        _('ScanKeyData', 'sk_flags', [
            to(8_01_00, [
                ['SK_ISNULL',		'0x0001'],
                ['SK_UNARY',		'0x0002'],
            ]),
            interval(8_01_00, 8_02_00, [
                ['SK_ISNULL',		'0x0001'],
                ['SK_UNARY',		'0x0002'],
                ['SK_NEGATE',		'0x0004'],
            ]),
            interval(8_02_00, 8_03_00, [
                ['SK_ISNULL',		'0x0001'],
                ['SK_UNARY',		'0x0002'],
                ['SK_ROW_HEADER',	'0x0004'],
                ['SK_ROW_MEMBER',	'0x0008'],
                ['SK_ROW_END',		'0x0010'],
            ]),
            interval(8_03_00, 9_00_00, [
                ['SK_ISNULL',		'0x0001'],
                ['SK_UNARY',		'0x0002'],
                ['SK_ROW_HEADER',	'0x0004'],
                ['SK_ROW_MEMBER',	'0x0008'],
                ['SK_ROW_END',		'0x0010'],
                ['SK_SEARCHNULL',	'0x0020'],
            ]),
            interval(9_00_00, 9_01_00, [
                ['SK_ISNULL',			'0x0001'],
                ['SK_UNARY',			'0x0002'],
                ['SK_ROW_HEADER',		'0x0004'],
                ['SK_ROW_MEMBER',		'0x0008'],
                ['SK_ROW_END',			'0x0010'],
                ['SK_SEARCHNULL',		'0x0020'],
                ['SK_SEARCHNOTNULL',	'0x0040'],
            ]),
            from(9_01_00, [
                ['SK_ISNULL',			'0x0001'],
                ['SK_UNARY',			'0x0002'],
                ['SK_ROW_HEADER',		'0x0004'],
                ['SK_ROW_MEMBER',		'0x0008'],
                ['SK_ROW_END',			'0x0010'],
                ['SK_SEARCHNULL',		'0x0020'],
                ['SK_SEARCHNOTNULL',	'0x0040'],
                ['SK_ORDER_BY',			'0x0100'],
            ]),
        ]),
        
        /* src/include/statistics/statistics.h */
        _('MVNDistinct', 'type', [
            from(10_00_00, [
                ['STATS_NDISTINCT_TYPE_BASIC', '1'],
            ]),
        ]),
        
        _('MVDependencies', 'type', [
            from(10_00_00, [
                ['STATS_DEPS_TYPE_BASIC', '1'],
            ]),
        ]),
        
        _('MCVList', 'type', [
            from(10_00_00, [
                ['STATS_MCV_TYPE_BASIC', '1'],
            ]),
        ]),

        /* src/include/access/gist.h */
        _('GISTPageOpaqueData', 'flags', [
            to(8_02_00, [
                ['F_LEAF', '(1 << 0)'],
            ]),
            interval(8_02_00, 9_00_00, [
                ['F_LEAF',			'(1 << 0)'],
                ['F_DELETED',		'(1 << 1)'],
                ['F_TUPLES_DELETED',	'(1 << 2)'],
            ]),
            interval(9_00_00, 9_01_00, [
                ['F_LEAF',				'(1 << 0)'],
                ['F_DELETED',			'(1 << 1)'],
                ['F_TUPLES_DELETED',	'(1 << 2)'],
                ['F_FOLLOW_RIGHT',		'(1 << 3)'],
            ]),
            from(9_01_00, [
                ['F_LEAF',				'(1 << 0)'],
                ['F_DELETED',			'(1 << 1)'],
                ['F_TUPLES_DELETED',	'(1 << 2)'],
                ['F_FOLLOW_RIGHT',		'(1 << 3)'],
                ['F_HAS_GARBAGE',		'(1 << 4)'],
            ]),
        ]),

        /* src/include/access/spgist_private.h */
        _('SpGistPageOpaqueData', 'flags', [
            from(9_00_00, [
                ['SPGIST_META', '(1<<0)'],
                ['SPGIST_DELETED', '(1<<1)'],
                ['SPGIST_LEAF', '(1<<2)'],
                ['SPGIST_NULLS', '(1<<3)'],
            ]),
        ]),

        /* src/include/access/ginblock.h */
        _('GinPageOpaqueData', 'flags', [
            to(8_04_00, [
                ['GIN_DATA',		  '(1 << 0)'],
                ['GIN_LEAF',		  '(1 << 1)'],
                ['GIN_DELETED',		  '(1 << 2)'],
            ]),
            interval(8_04_00, 9_02_00, [
                ['GIN_DATA',		  '(1 << 0)'],
                ['GIN_LEAF',		  '(1 << 1)'],
                ['GIN_DELETED',		  '(1 << 2)'],
                ['GIN_META',		  '(1 << 3)'],
                ['GIN_LIST',		  '(1 << 4)'],
                ['GIN_LIST_FULLROW',  '(1 << 5)'],
            ]),
            from(9_02_00, [
                ['GIN_DATA', '(1<<0)'],
                ['GIN_LEAF', '(1<<1)'],
                ['GIN_DELETED', '(1 << 2)'],
                ['GIN_META', '(1 << 3)'],
                ['GIN_LIST', '(1 << 4)'],
                ['GIN_LIST_FULLROW', '(1 << 5)'],
                ['GIN_INCOMPLETE_SPLIT', '(1 << 6)'],
                ['GIN_COMPRESSED', '(1 << 7)'],
            ]),
        ]),

        /* src/include/access/ginxlog.h */
        _('ginxlogSplit', 'flags', [
            from(9_00_00, [
                ['GIN_INSERT_ISDATA', '0x01'],
                ['GIN_INSERT_ISLEAF', '0x02'],
                ['GIN_SPLIT_ROOT', '0x04'],
            ]),
        ]),

        /* src/include/access/itup.h */
        _('IndexTupleData', 't_info', [
            unbounded([
                ['INDEX_VAR_MASK', '0x4000'],
                ['INDEX_NULL_MASK', '0x8000'],
            ], [
                ['size', ['INDEX_SIZE_MASK', '0x1FFF']],
            ]),
        ]),

        /* src/include/access/hash.h */
        _('HashPageOpaqueData', 'hasho_flag', [
            to(10_00_00, [
                ['LH_UNUSED_PAGE',          '(0)'],
                ['LH_OVERFLOW_PAGE',		'(1 << 0)'],
                ['LH_BUCKET_PAGE',			'(1 << 1)'],
                ['LH_BITMAP_PAGE',			'(1 << 2)'],
                ['LH_META_PAGE',			'(1 << 3)'],
            ]),
            from(10_00_00, [
                ['LH_UNUSED_PAGE',          '(0)'],
                ['LH_OVERFLOW_PAGE', '(1 << 0)'],
                ['LH_BUCKET_PAGE', '(1 << 1)'],
                ['LH_BITMAP_PAGE', '(1 << 2)'],
                ['LH_META_PAGE', '(1 << 3)'],
                ['LH_BUCKET_BEING_POPULATED', '(1 << 4)'],
                ['LH_BUCKET_BEING_SPLIT', '(1 << 5)'],
                ['LH_BUCKET_NEEDS_SPLIT_CLEANUP', '(1 << 6)'],
                ['LH_PAGE_HAS_DEAD_TUPLES', '(1 << 7)'],
            ]),
        ]),

        /* src/include/access/nbtree.h */
        _('BTPageOpaqueData', 'btop_flags', [
            to(8_02_00, [
                ['BTP_LEAF',		'(1 << 0)'],
                ['BTP_ROOT',		'(1 << 1)'],
                ['BTP_DELETED',		'(1 << 2)'],
                ['BTP_META',		'(1 << 3)'],
                ['BTP_HALF_DEAD',	'(1 << 4)'],
            ]),
            interval(8_02_00, 9_00_00, [
                ['BTP_LEAF',		'(1 << 0)'],
                ['BTP_ROOT',		'(1 << 1)'],
                ['BTP_DELETED',		'(1 << 2)'],
                ['BTP_META',		'(1 << 3)'],
                ['BTP_HALF_DEAD',	'(1 << 4)'],
                ['BTP_SPLIT_END',	'(1 << 5)'],
                ['BTP_HAS_GARBAGE', '(1 << 6)'],
            ]),
            interval(9_00_00, 14_00_00, [
                ['BTP_LEAF', '(1 << 0)'],
                ['BTP_ROOT', '(1 << 1)'],
                ['BTP_DELETED', '(1 << 2)'],
                ['BTP_META', '(1 << 3)'],
                ['BTP_HALF_DEAD', '(1 << 4)'],
                ['BTP_SPLIT_END', '(1 << 5)'],
                ['BTP_HAS_GARBAGE', '(1 << 6)'],
                ['BTP_INCOMPLETE_SPLIT', '(1 << 7)'],
            ]),
            from(14_00_00, [
                ['BTP_LEAF', '(1 << 0)'],
                ['BTP_ROOT', '(1 << 1)'],
                ['BTP_DELETED', '(1 << 2)'],
                ['BTP_META', '(1 << 3)'],
                ['BTP_HALF_DEAD', '(1 << 4)'],
                ['BTP_SPLIT_END', '(1 << 5)'],
                ['BTP_HAS_GARBAGE', '(1 << 6)'],
                ['BTP_INCOMPLETE_SPLIT', '(1 << 7)'],
                ['BTP_HAS_FULLXID', '(1 << 8)'],
            ]),
        ]),

        /* src/include/catalog/pg_trigger_d.h */
        _('FormData_pg_trigger', 'tgtype', [
            to(8_04_00, [
                ['TRIGGER_TYPE_ROW', '(1 << 0)'],
                ['TRIGGER_TYPE_BEFORE', '(1 << 1)'],
                ['TRIGGER_TYPE_INSERT', '(1 << 2)'],
                ['TRIGGER_TYPE_DELETE', '(1 << 3)'],
                ['TRIGGER_TYPE_UPDATE', '(1 << 4)'],
            ]),
            interval(8_04_00, 9_00_00, [
                ['TRIGGER_TYPE_ROW',				'(1 << 0)'],
                ['TRIGGER_TYPE_BEFORE',				'(1 << 1)'],
                ['TRIGGER_TYPE_INSERT',				'(1 << 2)'],
                ['TRIGGER_TYPE_DELETE',				'(1 << 3)'],
                ['TRIGGER_TYPE_UPDATE',				'(1 << 4)'],
                ['TRIGGER_TYPE_TRUNCATE',			'(1 << 5)'],
            ]),
            from(9_00_00, [
                ['TRIGGER_TYPE_ROW',				'(1 << 0)'],
                ['TRIGGER_TYPE_BEFORE',				'(1 << 1)'],
                ['TRIGGER_TYPE_INSERT',				'(1 << 2)'],
                ['TRIGGER_TYPE_DELETE',				'(1 << 3)'],
                ['TRIGGER_TYPE_UPDATE',				'(1 << 4)'],
                ['TRIGGER_TYPE_TRUNCATE',			'(1 << 5)'],
                ['TRIGGER_TYPE_INSTEAD',			'(1 << 6)'],
            ]),
        ]),

        /* src/include/replication/reorderbuffer.h */
        _('ReorderBufferTXN', 'txn_flags', [
            interval(13_00_00, 14_00_00,  [
                ['RBTXN_HAS_CATALOG_CHANGES', '0x0001'],
                ['RBTXN_IS_SUBXACT',          '0x0002'],
                ['RBTXN_IS_SERIALIZED',       '0x0004'],
            ]),
            interval(14_00_00, 16_00_00, [
                ['RBTXN_HAS_CATALOG_CHANGES', '0x0001'],
                ['RBTXN_IS_SUBXACT',          '0x0002'],
                ['RBTXN_IS_SERIALIZED',       '0x0004'],
                ['RBTXN_IS_SERIALIZED_CLEAR', '0x0008'],
                ['RBTXN_IS_STREAMED',         '0x0010'],
                ['RBTXN_HAS_PARTIAL_CHANGE',  '0x0020'],
                ['RBTXN_PREPARE',             '0x0040'],
                ['RBTXN_SKIPPED_PREPARE',	  '0x0080'],
            ]),
            from(16_00_00, [
                ['RBTXN_HAS_CATALOG_CHANGES', '0x0001'],
                ['RBTXN_IS_SUBXACT', '0x0002'],
                ['RBTXN_IS_SERIALIZED', '0x0004'],
                ['RBTXN_IS_SERIALIZED_CLEAR', '0x0008'],
                ['RBTXN_IS_STREAMED', '0x0010'],
                ['RBTXN_HAS_PARTIAL_CHANGE', '0x0020'],
                ['RBTXN_PREPARE', '0x0040'],
                ['RBTXN_SKIPPED_PREPARE', '0x0080'],
                ['RBTXN_HAS_STREAMABLE_CHANGE', '0x0100'],
            ]),
        ]),

        /* src/include/access/xlogreader.h */
        _('DecodedBkpBlock', 'flags', [
            from(9_00_00, [
                ['BKPBLOCK_HAS_IMAGE', '0x10'],
                ['BKPBLOCK_HAS_DATA', '0x20'],
                ['BKPBLOCK_WILL_INIT', '0x40'],
                ['BKPBLOCK_SAME_REL', '0x80'],
            ], [
                ['fork', ['BKPBLOCK_FORK_MASK', '0x0F']],
            ]),
        ]),
        _('DecodedBkpBlock', 'bimg_info', [
            interval(9_00_00, 10_00_00, [
                ['BKPIMAGE_HAS_HOLE', '0x01'],
                ['BKPIMAGE_APPLY', '0x02'],
            ]),
            interval(10_00_00, 15_00_00, [
                ['BKPIMAGE_HAS_HOLE',		    '0x01'],
                ['BKPIMAGE_IS_COMPRESSED',		'0x02'],
                ['BKPIMAGE_APPLY',		        '0x04'],
            ]),
            from(15_00_00, [
                ['BKPIMAGE_HAS_HOLE', '0x01'],
                ['BKPIMAGE_APPLY', '0x02'],
                ['BKPIMAGE_COMPRESS_PGLZ', '0x04'],
                ['BKPIMAGE_COMPRESS_LZ4', '0x08'],
                ['BKPIMAGE_COMPRESS_ZSTD', '0x10'],
            ]),
        ]),

        /* src/include/storage/latch.h */
        _('WaitEvent', 'events', [
            interval(9_00_00, 10_00_00,[
                ['WL_LATCH_SET',		 '(1 << 0)'],
                ['WL_SOCKET_READABLE',	 '(1 << 1)'],
                ['WL_SOCKET_WRITEABLE',  '(1 << 2)'],
                ['WL_TIMEOUT',			 '(1 << 3)'],
                ['WL_POSTMASTER_DEATH',  '(1 << 4)'],
            ]),
            interval(10_00_00, 15_00_00, [
                ['WL_LATCH_SET',		 '(1 << 0)'],
                ['WL_SOCKET_READABLE',	 '(1 << 1)'],
                ['WL_SOCKET_WRITEABLE',  '(1 << 2)'],
                ['WL_TIMEOUT',			 '(1 << 3)'],
                ['WL_POSTMASTER_DEATH',  '(1 << 4)'],
                ['WL_SOCKET_CONNECTED',  '(1 << 2)'],
            ]),
            interval(15_00_00, 16_00_00, [
                ['WL_LATCH_SET',		 '(1 << 0)'],
                ['WL_SOCKET_READABLE',	 '(1 << 1)'],
                ['WL_SOCKET_WRITEABLE',  '(1 << 2)'],
                ['WL_TIMEOUT',			 '(1 << 3)'],
                ['WL_POSTMASTER_DEATH',  '(1 << 4)'],
                ['WL_SOCKET_CONNECTED',  '(1 << 2)'],
                ['WL_SOCKET_CLOSED',     '(1 << 7)'],
            ]),
            from(16_00_00, [
                ['WL_LATCH_SET', '(1 << 0)'],
                ['WL_SOCKET_READABLE', '(1 << 1)'],
                ['WL_SOCKET_WRITEABLE', '(1 << 2)'],
                ['WL_TIMEOUT', '(1 << 3)'],
                ['WL_POSTMASTER_DEATH', '(1 << 4)'],
                ['WL_EXIT_ON_PM_DEATH', '(1 << 5)'],

                /* these are platform-dependent, but I target on non-Windows */
                ['WL_SOCKET_CONNECTED', '(1 << 2)'],
                ['WL_SOCKET_CLOSED', '(1 << 7)'],
                ['WL_SOCKET_ACCEPT', '(1 << 1)'],
            ]),
        ]),

        ...[
            /* src/inlcude/utils/ackchk_internal.h */
            ['InternalGrant', 'privileges'],

            /* src/include/nodes/parsenodes.h */
            ['RTEPermissionInfo', 'requiredPerms'],
        ].map(([type, member]) => _(type, member, [
            to(8_01_00, [
                ['ACL_INSERT',		'(1<<0)'],
                ['ACL_SELECT',		'(1<<1)'],
                ['ACL_UPDATE',		'(1<<2)'],
                ['ACL_DELETE',		'(1<<3)'],
                ['ACL_RULE',		'(1<<4)'],
                ['ACL_REFERENCES',	'(1<<5)'],
                ['ACL_TRIGGER',		'(1<<6)'],
                ['ACL_EXECUTE',		'(1<<7)'],
                ['ACL_USAGE',		'(1<<8)'],
                ['ACL_CREATE',		'(1<<9)'],
                ['ACL_CREATE_TEMP', '(1<<10)'],
            ]),
            interval(8_01_00, 15_00_00, [
                ['ACL_INSERT',		'(1<<0)'],
                ['ACL_SELECT',		'(1<<1)'],
                ['ACL_UPDATE',		'(1<<2)'],
                ['ACL_DELETE',		'(1<<3)'],
                ['ACL_RULE',		'(1<<4)'],
                ['ACL_REFERENCES',	'(1<<5)'],
                ['ACL_TRIGGER',		'(1<<6)'],
                ['ACL_EXECUTE',		'(1<<7)'],
                ['ACL_USAGE',		'(1<<8)'],
                ['ACL_CREATE',		'(1<<9)'],
                ['ACL_CREATE_TEMP', '(1<<10)'],
                ['ACL_CONNECT', '(1<<11)'],
            ]),
            interval(15_00_00, 17_00_00, [
                ['ACL_INSERT', '(1<<0)'],
                ['ACL_SELECT', '(1<<1)'],
                ['ACL_UPDATE', '(1<<2)'],
                ['ACL_DELETE', '(1<<3)'],
                ['ACL_TRUNCATE', '(1<<4)'],
                ['ACL_REFERENCES', '(1<<5)'],
                ['ACL_TRIGGER', '(1<<6)'],
                ['ACL_EXECUTE', '(1<<7)'],
                ['ACL_USAGE', '(1<<8)'],
                ['ACL_CREATE', '(1<<9)'],
                ['ACL_CREATE_TEMP', '(1<<10)'],
                ['ACL_CONNECT', '(1<<11)'],
                ['ACL_SET', '(1<<12)'],
                ['ACL_ALTER_SYSTEM', '(1<<13)'],
            ]),
            from(17_00_00, [
                ['ACL_INSERT', '(1<<0)'],
                ['ACL_SELECT', '(1<<1)'],
                ['ACL_UPDATE', '(1<<2)'],
                ['ACL_DELETE', '(1<<3)'],
                ['ACL_TRUNCATE', '(1<<4)'],
                ['ACL_REFERENCES', '(1<<5)'],
                ['ACL_TRIGGER', '(1<<6)'],
                ['ACL_EXECUTE', '(1<<7)'],
                ['ACL_USAGE', '(1<<8)'],
                ['ACL_CREATE', '(1<<9)'],
                ['ACL_CREATE_TEMP', '(1<<10)'],
                ['ACL_CONNECT', '(1<<11)'],
                ['ACL_SET', '(1<<12)'],
                ['ACL_ALTER_SYSTEM', '(1<<13)'],
                ['ACL_MAINTAIN', '(1<<14)'],
            ]),
        ])),

        /* src/include/access/brin_tuple.h */
        _('BrinTuple', 'bt_info', [
            from(11_00_00, [
                ['BRIN_EMPTY_RANGE_MASK', '0x20'],
                ['BRIN_PLACEHOLDER_MASK', '0x40'],
                ['BRIN_NULLS_MASK', '0x80'],
            ], [
                ['offset', ['BRIN_OFFSET_MASK', '0x1F']],
            ]),
        ]),

        /* src/include/nodes/execnodes.h */
        ...[
            ['WindowAggState', 'frameOptions'],

            /* src/include/nodes/parsenodes.h */
            ['WindowDef', 'frameOptions'],
        ].map(([type, member]) => _(type, member, [
            interval(8_04_00, 9_00_00, [
                ['FRAMEOPTION_NONDEFAULT',					'0x00001'],
                ['FRAMEOPTION_RANGE',						'0x00002'],
                ['FRAMEOPTION_ROWS',						'0x00004'],
                ['FRAMEOPTION_BETWEEN',						'0x00008'],
                ['FRAMEOPTION_START_UNBOUNDED_PRECEDING',	'0x00010'],
                ['FRAMEOPTION_END_UNBOUNDED_PRECEDING',		'0x00020'],
                ['FRAMEOPTION_START_UNBOUNDED_FOLLOWING',	'0x00040'],
                ['FRAMEOPTION_END_UNBOUNDED_FOLLOWING',		'0x00080'],
                ['FRAMEOPTION_START_CURRENT_ROW',			'0x00100'],
                ['FRAMEOPTION_END_CURRENT_ROW',				'0x00200'],
            ]),
            interval(9_00_00, 11_00_00, [
                ['FRAMEOPTION_NONDEFAULT',					'0x00001'],
                ['FRAMEOPTION_RANGE',						'0x00002'],
                ['FRAMEOPTION_ROWS',						'0x00004'],
                ['FRAMEOPTION_BETWEEN',						'0x00008'],
                ['FRAMEOPTION_START_UNBOUNDED_PRECEDING',	'0x00010'],
                ['FRAMEOPTION_END_UNBOUNDED_PRECEDING',		'0x00020'],
                ['FRAMEOPTION_START_UNBOUNDED_FOLLOWING',	'0x00040'],
                ['FRAMEOPTION_END_UNBOUNDED_FOLLOWING',		'0x00080'],
                ['FRAMEOPTION_START_CURRENT_ROW',			'0x00100'],
                ['FRAMEOPTION_END_CURRENT_ROW',				'0x00200'],
                ['FRAMEOPTION_START_VALUE_PRECEDING',		'0x00400'],
                ['FRAMEOPTION_END_VALUE_PRECEDING',			'0x00800'],
                ['FRAMEOPTION_START_VALUE_FOLLOWING',		'0x01000'],
                ['FRAMEOPTION_END_VALUE_FOLLOWING',			'0x02000'],
            ]),
            from(11_00_00, [
                ['FRAMEOPTION_NONDEFAULT', '0x00001'],
                ['FRAMEOPTION_RANGE', '0x00002'],
                ['FRAMEOPTION_ROWS', '0x00004'],
                ['FRAMEOPTION_GROUPS', '0x00008'],
                ['FRAMEOPTION_BETWEEN', '0x00010'],
                ['FRAMEOPTION_START_UNBOUNDED_PRECEDING', '0x00020'],
                ['FRAMEOPTION_END_UNBOUNDED_PRECEDING', '0x00040'],
                ['FRAMEOPTION_START_UNBOUNDED_FOLLOWING', '0x00080'],
                ['FRAMEOPTION_END_UNBOUNDED_FOLLOWING', '0x00100'],
                ['FRAMEOPTION_START_CURRENT_ROW', '0x00200'],
                ['FRAMEOPTION_END_CURRENT_ROW', '0x00400'],
                ['FRAMEOPTION_START_OFFSET_PRECEDING', '0x00800'],
                ['FRAMEOPTION_END_OFFSET_PRECEDING', '0x01000'],
                ['FRAMEOPTION_START_OFFSET_FOLLOWING', '0x02000'],
                ['FRAMEOPTION_END_OFFSET_FOLLOWING', '0x04000'],
                ['FRAMEOPTION_EXCLUDE_CURRENT_ROW', '0x08000'],
                ['FRAMEOPTION_EXCLUDE_GROUP', '0x10000'],
                ['FRAMEOPTION_EXCLUDE_TIES', '0x20000'],
            ]),
        ])),

        _('ExprState', 'flags', [
            from(10_00_00, [
                ['EEO_FLAG_IS_QUAL', '(1 << 0)'],
                ['EEO_FLAG_INTERPRETER_INITIALIZED', '(1 << 1)'],
                ['EEO_FLAG_DIRECT_THREADED', '(1 << 2)'],
            ]),
        ]),

        ...[
            ['FunctionScanState', 'eflags'],
            ['EState', 'es_top_eflags'],
        ].map(([type, member]) => _(type, member, [
            interval(8_02_00, 9_02_00,[
                ['EXEC_FLAG_EXPLAIN_ONLY',	'0x0001'],
                ['EXEC_FLAG_REWIND',		'0x0002'],
                ['EXEC_FLAG_BACKWARD',		'0x0004'],
                ['EXEC_FLAG_MARK',			'0x0008'],
            ]),
            interval(9_02_00, 12_00_00, [
                ['EXEC_FLAG_EXPLAIN_ONLY',	'0x0001'],
                ['EXEC_FLAG_REWIND',		'0x0002'],
                ['EXEC_FLAG_BACKWARD',		'0x0004'],
                ['EXEC_FLAG_MARK',			'0x0008'],
                ['EXEC_FLAG_SKIP_TRIGGERS', '0x0010'],
                ['EXEC_FLAG_WITH_OIDS',		'0x0020'],
                ['EXEC_FLAG_WITHOUT_OIDS',	'0x0040'],
                ['EXEC_FLAG_WITH_NO_DATA',	'0x0080'],
            ]),
            interval(12_00_00, 16_00_00, [
                ['EXEC_FLAG_EXPLAIN_ONLY',	'0x0001'],
                ['EXEC_FLAG_REWIND',		'0x0002'],
                ['EXEC_FLAG_BACKWARD',		'0x0004'],
                ['EXEC_FLAG_MARK',			'0x0008'],
                ['EXEC_FLAG_SKIP_TRIGGERS', '0x0010'],
                ['EXEC_FLAG_WITH_NO_DATA',	'0x0020'],
            ]),
            from(16_00_00, [
                ['EXEC_FLAG_EXPLAIN_ONLY', '0x0001'],
                ['EXEC_FLAG_EXPLAIN_GENERIC', '0x0002'],
                ['EXEC_FLAG_REWIND', '0x0004'],
                ['EXEC_FLAG_BACKWARD', '0x0008'],
                ['EXEC_FLAG_MARK', '0x0010'],
                ['EXEC_FLAG_SKIP_TRIGGERS', '0x0020'],
                ['EXEC_FLAG_WITH_NO_DATA', '0x0040'],
            ]),
        ]),

              _('EState', 'es_jit_flags', [
                  from(11_00_00, [
                      ['PGJIT_NONE', '0'],
                      ['PGJIT_PERFORM', '(1 << 0)'],
                      ['PGJIT_OPT3', '(1 << 1)'],
                      ['PGJIT_INLINE', '(1 << 2)'],
                      ['PGJIT_EXPR', '(1 << 3)'],
                      ['PGJIT_DEFORM', '(1 << 4)'],
                  ]),
              ])),

        _('ModifyTableState', 'mt_merge_subcommands', [
            from(15_00_00, [
                ['MERGE_INSERT', '0x01'],
                ['MERGE_UPDATE', '0x02'],
                ['MERGE_DELETE', '0x04'],
            ]),
        ]),

        /* src/include/nodes/pathnodes.h */
        _('GroupPathExtraData', 'flags', [
            from(11_00_00, [
                ['GROUPING_CAN_USE_SORT', '0x0001'],
                ['GROUPING_CAN_USE_HASH', '0x0002'],
                ['GROUPING_CAN_PARTIAL_AGG', '0x0004'],
            ]),
        ]),

        /* src/include/executor/tuptable.h */
        _('TupleTableSlot', 'tts_flags', [
            from(12_00_00, [
                ['TTS_FLAG_EMPTY', '(1 << 1)'],
                ['TTS_FLAG_SHOULDFREE', '(1 << 2)'],
                ['TTS_FLAG_SLOW', '(1 << 3)'],
                ['TTS_FLAG_FIXED', '(1 << 4)'],
            ]),
        ]),

        /* src/include/access/toast_helper.h */
        _('ToastTupleContext', 'ttc_flags', [
            from(13_00_00, [
                ['TOAST_NEEDS_DELETE_OLD', '0x0001'],
                ['TOAST_NEEDS_FREE', '0x0002'],
                ['TOAST_HAS_NULLS', '0x0004'],
                ['TOAST_NEEDS_CHANGE', '0x0008'],
            ]),
        ]),

        _('ToastAttrInfo', 'tai_colflags', [
            from(13_00_00, [
                ['TOASTCOL_NEEDS_DELETE_OLD', '0x0001'],
                ['TOASTCOL_NEEDS_FREE', '0x0002'],
                ['TOASTCOL_IGNORE', '0x0010'],
                ['TOASTCOL_INCOMPRESSIBLE', '0x0020'],
            ]),
        ]),

        /* src/include/storatge/proc.h */
        _('PGPROC', 'delayChkptFlags', [
            from(10_00_00, [
                ['DELAY_CHKPT_START', '(1<<0)'],
                ['DELAY_CHKPT_COMPLETE', '(1<<1)'],
            ]),
        ]),
        
        _('PGXACT', 'vacuumFlags', [
            interval(8_03_00, 9_04_00, [
                ['PROC_IS_AUTOVACUUM',	'0x01'],
                ['PROC_IN_VACUUM',		'0x02'],
                ['PROC_IN_ANALYZE',		'0x04'],
                ['PROC_VACUUM_FOR_WRAPAROUND', '0x08'],
            ]),
            interval(9_04_00, 14_00_00, [
                ['PROC_IS_AUTOVACUUM',	'0x01'],
                ['PROC_IN_VACUUM',		'0x02'],
                ['PROC_IN_ANALYZE',		'0x04'],
                ['PROC_VACUUM_FOR_WRAPAROUND',	'0x08'],
                ['PROC_IN_LOGICAL_DECODING',	'0x10'],
            ]),
        ]),

        _('PGPROC', 'statusFlags', [
            interval(14_00_00, 15_00_00, [
                ['PROC_IS_AUTOVACUUM', '0x01'],
                ['PROC_IN_VACUUM', '0x02'],
                ['PROC_IN_SAFE_IC', '0x04'],
                ['PROC_VACUUM_FOR_WRAPAROUND', '0x08'],
                ['PROC_IN_LOGICAL_DECODING', '0x10'],
            ]),
            from(15_00_00, [
                ['PROC_IS_AUTOVACUUM', '0x01'],
                ['PROC_IN_VACUUM', '0x02'],
                ['PROC_IN_SAFE_IC', '0x04'],
                ['PROC_VACUUM_FOR_WRAPAROUND', '0x08'],
                ['PROC_IN_LOGICAL_DECODING', '0x10'],
                ['PROC_AFFECTS_ALL_HORIZONS', '0x20'],
            ]),
        ]),

        /* src/backend/catalog/dependency.c */
        _('ObjectAddressExtra', 'flags', [
            interval(8_04_00, 9_02_00, [
                ['DEPFLAG_ORIGINAL',	'0x0001'],
                ['DEPFLAG_NORMAL',		'0x0002'],
                ['DEPFLAG_AUTO',		'0x0004'],
                ['DEPFLAG_INTERNAL',	'0x0008'],
            ]),
            interval(9_02_00, 12_00_00, [
                ['DEPFLAG_ORIGINAL',	'0x0001'],
                ['DEPFLAG_NORMAL',		'0x0002'],
                ['DEPFLAG_AUTO',		'0x0004'],
                ['DEPFLAG_INTERNAL',	'0x0008'],
                ['DEPFLAG_EXTENSION',	'0x0010'],
                ['DEPFLAG_REVERSE',		'0x0020'],
            ]),
            from(12_00_00, [
                ['DEPFLAG_ORIGINAL',	'0x0001'],
                ['DEPFLAG_NORMAL',		'0x0002'],
                ['DEPFLAG_AUTO',		'0x0004'],
                ['DEPFLAG_INTERNAL',	'0x0008'],
                ['DEPFLAG_PARTITION',	'0x0010'],
                ['DEPFLAG_EXTENSION',	'0x0020'],
                ['DEPFLAG_REVERSE',		'0x0040'],
                ['DEPFLAG_IS_PART',		'0x0080'],
                ['DEPFLAG_SUBOBJECT',	'0x0100'],
            ]),
        ]),

        /* src/include/catalog/storage_xlog.h */
        _('xl_smgr_truncate', 'flags', [
            from(9_06_00, [
                ['SMGR_TRUNCATE_HEAP', '0x0001'],
                ['SMGR_TRUNCATE_VM', '0x0002'],
                ['SMGR_TRUNCATE_FSM', '0x0004'],
            ]),
        ]),

        /* src/include/commands/vacuum.h */
        _('VacuumParams', 'options', [
            interval(14_00_00, 16_00_00, [
                ['VACOPT_VACUUM', '0x01'],
                ['VACOPT_ANALYZE', '0x02'],
                ['VACOPT_VERBOSE', '0x04'],
                ['VACOPT_FREEZE', '0x08'],
                ['VACOPT_FULL', '0x10'],
                ['VACOPT_SKIP_LOCKED', '0x20'],
                ['VACOPT_PROCESS_TOAST', '0x40'],
                ['VACOPT_DISABLE_PAGE_SKIPPING', '0x80'],
            ]),
            from(16_00_00, [
                ['VACOPT_VACUUM', '0x01'],
                ['VACOPT_ANALYZE', '0x02'], 
                ['VACOPT_VERBOSE', '0x04'],
                ['VACOPT_FREEZE', '0x08'],
                ['VACOPT_FULL', '0x10'],
                ['VACOPT_SKIP_LOCKED', '0x20'],
                ['VACOPT_PROCESS_MAIN', '0x40'],
                ['VACOPT_PROCESS_TOAST', '0x80'],
                ['VACOPT_DISABLE_PAGE_SKIPPING', '0x100'],
                ['VACOPT_SKIP_DATABASE_STATS', '0x200'],
                ['VACOPT_ONLY_DATABASE_STATS', '0x400'],
            ]),
        ]),

        /* src/include/commands/cluster.h */
        _('ClusterParams', 'options', [
            interval(14_00_00, 15_00_00, [
                ['CLUOPT_VERBOSE', '0x01'],
                ['CLUOPT_RECHECK', '0x02'],
            ]),
            from(15_00_00, [
                ['CLUOPT_VERBOSE`', '0x01'],
                ['CLUOPT_RECHECK', '0x02'],
                ['CLUOPT_RECHECK`_ISCLUSTERED', '0x04'],
            ]),
        ]),

        /* src/include/catalog/index.h */
        _('ReindexParams', 'options', [
            interval(9_05_00, 12_00_00, [
                ['REINDEXOPT_VERBOSE', '0x01'],
            ]),
            interval(12_00_00, 14_00_00, [
                ['REINDEXOPT_VERBOSE', '0x01'],
                ['REINDEXOPT_REPORT_PROGRESS', '0x02'],
            ]),
            from(14_00_00, [
                ['REINDEXOPT_VERBOSE', '0x01'],
                ['REINDEXOPT_REPORT_PROGRESS', '0x02'],
                ['REINDEXOPT_MISSING_OK', '0x04'],
                ['REINDEXOPT_CONCURRENTLY', '0x08'],
            ]),
        ]),

        /* src/include/utils/portal.h */
        ...[
            ['PortalData', 'cursorOptions'],
            ['DelcareCursorStmt', 'options'],

            /* src/include/utils/plancache.h */
            ['CachedPlanSource', 'cursor_options'],
        ].map(([type, member]) => _(type, member, [
            to(8_03_00, [
                ['CURSOR_OPT_BINARY',		'0x0001'],
                ['CURSOR_OPT_SCROLL',		'0x0002'],
                ['CURSOR_OPT_NO_SCROLL',	'0x0004'],
                ['CURSOR_OPT_INSENSITIVE',	'0x0008'],
                ['CURSOR_OPT_HOLD',			'0x0010'],
            ]),
            interval(8_03_00, 9_02_00, [
                ['CURSOR_OPT_BINARY',		'0x0001'],
                ['CURSOR_OPT_SCROLL',		'0x0002'],
                ['CURSOR_OPT_NO_SCROLL',	'0x0004'],
                ['CURSOR_OPT_INSENSITIVE',	'0x0008'],
                ['CURSOR_OPT_HOLD',			'0x0010'],
                ['CURSOR_OPT_FAST_PLAN',	'0x0020'],
            ]),
            interval(9_02_00, 9_06_00, [
                ['CURSOR_OPT_BINARY', '0x0001'],
                ['CURSOR_OPT_SCROLL', '0x0002'],
                ['CURSOR_OPT_NO_SCROLL', '0x0004'],
                ['CURSOR_OPT_INSENSITIVE', '0x0008'],
                ['CURSOR_OPT_ASENSITIVE', '0x0010'],
                ['CURSOR_OPT_HOLD', '0x0020'],
                ['CURSOR_OPT_FAST_PLAN', '0x0100'],
                ['CURSOR_OPT_GENERIC_PLAN', '0x0200'],
                ['CURSOR_OPT_CUSTOM_PLAN', '0x0400'],
            ]),
            from(9_06_00, [
                ['CURSOR_OPT_BINARY', '0x0001'],
                ['CURSOR_OPT_SCROLL', '0x0002'],
                ['CURSOR_OPT_NO_SCROLL', '0x0004'],
                ['CURSOR_OPT_INSENSITIVE', '0x0008'],
                ['CURSOR_OPT_ASENSITIVE', '0x0010'],
                ['CURSOR_OPT_HOLD', '0x0020'],
                ['CURSOR_OPT_FAST_PLAN', '0x0100'],
                ['CURSOR_OPT_GENERIC_PLAN', '0x0200'],
                ['CURSOR_OPT_CUSTOM_PLAN', '0x0400'],
                ['CURSOR_OPT_PARALLEL_OK', '0x0800'],
            ]),
        ])),

        /* src/include/commands/trigger.h */
        ...[
            ['TriggerData', 'tg_event'],
            ['AfterTriggerEventData', 'ate_event'],
            ['AfterTriggerSharedData', 'ats_event'],
        ].map(([type, member]) =>
            _(type, member, [
                to(8_04_00, [
                    ['TRIGGER_EVENT_INSERT',			'0x00000000'],
                    ['TRIGGER_EVENT_DELETE',			'0x00000001'],
                    ['TRIGGER_EVENT_UPDATE',			'0x00000002'],
                    ['TRIGGER_EVENT_ROW',				'0x00000004'],
                    ['TRIGGER_EVENT_BEFORE',			'0x00000008'],
                    ['AFTER_TRIGGER_DONE',				'0x00000010'],
                    ['AFTER_TRIGGER_IN_PROGRESS',		'0x00000020'],
                    ['AFTER_TRIGGER_DEFERRABLE',		'0x00000040'],
                    ['AFTER_TRIGGER_INITDEFERRED',		'0x00000080'],
                ]),
                interval(8_04_00, 9_01_00, [
                    ['TRIGGER_EVENT_INSERT',			'0x00000000'],
                    ['TRIGGER_EVENT_DELETE',			'0x00000001'],
                    ['TRIGGER_EVENT_UPDATE',			'0x00000002'],
                    ['TRIGGER_EVENT_TRUNCATE',			'0x00000003'],
                    ['TRIGGER_EVENT_ROW',				'0x00000004'],
                    ['TRIGGER_EVENT_BEFORE',			'0x00000008'],
                    ['AFTER_TRIGGER_DEFERRABLE',		'0x00000010'],
                    ['AFTER_TRIGGER_INITDEFERRED',		'0x00000020'],
                ]),
                from(9_01_00, [
                    ['TRIGGER_EVENT_INSERT', '0x00000000'],
                    ['TRIGGER_EVENT_DELETE', '0x00000001'],
                    ['TRIGGER_EVENT_UPDATE', '0x00000002'],
                    ['TRIGGER_EVENT_TRUNCATE', '0x00000003'],
                    ['TRIGGER_EVENT_ROW', '0x00000004'],
                    ['TRIGGER_EVENT_BEFORE', '0x00000008'],
                    ['TRIGGER_EVENT_AFTER', '0x00000000'],
                    ['TRIGGER_EVENT_INSTEAD', '0x00000010'],
                    ['AFTER_TRIGGER_DEFERRABLE',		'0x00000020'],
                    ['AFTER_TRIGGER_INITDEFERRED',		'0x00000040'],
                ]),
            ]),
        ),

        /* src/backend/commands/trigger.c */

        ...[
            'AfterTriggerEventData',
            'AfterTriggerEventDataNoOids',
            'AfterTriggerEventDataOneCtid',
            'AfterTriggerEventDataZeroCtids',
        ].map(type => _(type, 'ate_flags', [
            to(9_04_00, [
                ['AFTER_TRIGGER_2CTIDS',			'0x10000000'],
                ['AFTER_TRIGGER_DONE',				'0x20000000'],
                ['AFTER_TRIGGER_IN_PROGRESS',		'0x40000000'],
            ], [
                ['offset', ['AFTER_TRIGGER_OFFSET', '0x0FFFFFFF']],
            ]),
            interval(9_04_00, 15_00_00, [
                ['AFTER_TRIGGER_DONE',				'0x10000000'],
                ['AFTER_TRIGGER_IN_PROGRESS',		'0x20000000'],
                ['AFTER_TRIGGER_FDW_REUSE',			'0x00000000'],
                ['AFTER_TRIGGER_FDW_FETCH',			'0x80000000'],
                ['AFTER_TRIGGER_1CTID',				'0x40000000'],
                ['AFTER_TRIGGER_2CTID',				'0xC0000000'],
            ], [
                ['offset', ['AFTER_TRIGGER_OFFSET', '0x0FFFFFFF']],
            ]),
            from(15_00_00, [
                ['AFTER_TRIGGER_DONE', '0x80000000'],
                ['AFTER_TRIGGER_IN_PROGRESS', '0x40000000'],
                ['AFTER_TRIGGER_FDW_REUSE', '0x00000000'],
                ['AFTER_TRIGGER_FDW_FETCH', '0x20000000'],
                ['AFTER_TRIGGER_1CTID', '0x10000000'],
                ['AFTER_TRIGGER_2CTID', '0x30000000'],
                ['AFTER_TRIGGER_CP_UPDATE', '0x08000000'],
            ], [
                ['offset', ['AFTER_TRIGGER_OFFSET', '0x07FFFFFF']],
            ]),
        ])),

        /* src/backend/commands/user.c */
        _('GrantRoleOptions', 'specified', [
            from(16_00_00, [
                ['GRANT_ROLE_SPECIFIED_ADMIN', '0x0001'],
                ['GRANT_ROLE_SPECIFIED_INHERIT', '0x0002'],
                ['GRANT_ROLE_SPECIFIED_SET', '0x0004'],
            ]),
        ]),

        /* src/include/storage/large_object.h */
        _('LargeObjectDesc', 'flags', [
            unbounded([
                ['IFS_RDLOCK', '(1 << 0)'],
                ['IFS_WRLOCK', '(1 << 1)'],
            ]),
        ]),

        /* src/utils/selfuncs.h */
        _('EstimationInfo', 'flags', [
            from(14_00_00, [
                ['SELFLAG_USED_DEFAULT', '(1 << 0)'],
            ]),
        ]),

        /* src/include/nodes/extensible.h */
        _('CustomScan', 'flags', [
            interval(9_05_00, 15_00_00, [
                ['CUSTOMPATH_SUPPORT_BACKWARD_SCAN', '0x0001'],
                ['CUSTOMPATH_SUPPORT_MARK_RESTORE', '0x0002'],
            ]),
            from(15_00_00, [
                ['CUSTOMPATH_SUPPORT_BACKWARD_SCAN', '0x0001'],
                ['CUSTOMPATH_SUPPORT_MARK_RESTORE', '0x0002'],
                ['CUSTOMPATH_SUPPORT_PROJECTION', '0x0004'],
            ]),
        ]),

        /* src/include/postmaster/bgworker.h */
        _('BackgroundWorker', 'bgw_flags', [
            interval(9_03_00, 10_00_00, [
                ['BGWORKER_SHMEM_ACCESS', '0x0001'],
                ['BGWORKER_BACKEND_DATABASE_CONNECTION', '0x0002'],
            ]),
            from(10_00_00, [
                ['BGWORKER_SHMEM_ACCESS', '0x0001'],
                ['BGWORKER_BACKEND_DATABASE_CONNECTION', '0x0002'],                
                ['BGWORKER_CLASS_PARALLEL', '0x0010'],
            ]),
        ]),

        /* src/include/utils/guc_tables.h */
        _('config_generic', 'flags', [
            to(8_02_00, [
                ['GUC_LIST_INPUT',			'0x0001'],
                ['GUC_LIST_QUOTE',			'0x0002'],
                ['GUC_NO_SHOW_ALL',			'0x0004'],
                ['GUC_NO_RESET_ALL',		'0x0008'],
                ['GUC_REPORT',				'0x0010'],
                ['GUC_NOT_IN_SAMPLE',		'0x0020'],
                ['GUC_DISALLOW_IN_FILE',	'0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	'0x0080'],
                ['GUC_SUPERUSER_ONLY',		'0x0100'],
                ['GUC_IS_NAME',				'0x0200'],
                ['GUC_NOT_WHILE_SEC_REST',	'0x8000'],
            ]),
            interval(8_02_00, 9_05_00, [
                ['GUC_LIST_INPUT',			'0x0001'],
                ['GUC_LIST_QUOTE',			'0x0002'],
                ['GUC_NO_SHOW_ALL',			'0x0004'],
                ['GUC_NO_RESET_ALL',		'0x0008'],
                ['GUC_REPORT',				'0x0010'],
                ['GUC_NOT_IN_SAMPLE',		'0x0020'],
                ['GUC_DISALLOW_IN_FILE',	'0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	'0x0080'],
                ['GUC_SUPERUSER_ONLY',		'0x0100'],
                ['GUC_IS_NAME',				'0x0200'],
                ['GUC_UNIT_KB',				'0x0400'],
                ['GUC_UNIT_BLOCKS',			'0x0800'],
                ['GUC_UNIT_XBLOCKS',		'0x0C00'],
                ['GUC_UNIT_MS',				'0x1000'],
                ['GUC_UNIT_S',				'0x2000'],
                ['GUC_UNIT_MIN',			'0x4000'],
                ['GUC_NOT_WHILE_SEC_REST',	'0x8000'],
            ]),
            interval(9_05_00, 10_00_00, [
                ['GUC_LIST_INPUT',			  '0x0001'],
                ['GUC_LIST_QUOTE',			  '0x0002'],
                ['GUC_NO_SHOW_ALL',			  '0x0004'],
                ['GUC_NO_RESET_ALL',		  '0x0008'],
                ['GUC_REPORT',				  '0x0010'],
                ['GUC_NOT_IN_SAMPLE',		  '0x0020'],
                ['GUC_DISALLOW_IN_FILE',	  '0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	  '0x0080'],
                ['GUC_SUPERUSER_ONLY',		  '0x0100'],
                ['GUC_IS_NAME',				  '0x0200'],
                ['GUC_NOT_WHILE_SEC_REST',	  '0x0400'],
                ['GUC_DISALLOW_IN_AUTO_FILE', '0x0800'],
                ['GUC_UNIT_KB',				  '0x1000'],
                ['GUC_UNIT_BLOCKS',			  '0x2000'],
                ['GUC_UNIT_XBLOCKS',		  '0x3000'],
                ['GUC_UNIT_XSEGS',			  '0x4000'],
                ['GUC_UNIT_MS',			     '0x10000'],
                ['GUC_UNIT_S',			     '0x20000'],
                ['GUC_UNIT_MIN',		     '0x30000'],
            ]),
            interval(10_00_00, 11_00_00, [
                ['GUC_LIST_INPUT',			  '0x0001'],
                ['GUC_LIST_QUOTE',			  '0x0002'],
                ['GUC_NO_SHOW_ALL',			  '0x0004'],
                ['GUC_NO_RESET_ALL',		  '0x0008'],
                ['GUC_REPORT',				  '0x0010'],
                ['GUC_NOT_IN_SAMPLE',		  '0x0020'],
                ['GUC_DISALLOW_IN_FILE',	  '0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	  '0x0080'],
                ['GUC_SUPERUSER_ONLY',		  '0x0100'],
                ['GUC_IS_NAME',				  '0x0200'],
                ['GUC_NOT_WHILE_SEC_REST',	  '0x0400'],
                ['GUC_DISALLOW_IN_AUTO_FILE', '0x0800'],
                ['GUC_UNIT_KB',				  '0x1000'],
                ['GUC_UNIT_BLOCKS',			  '0x2000'],
                ['GUC_UNIT_XBLOCKS',		  '0x3000'],
                ['GUC_UNIT_MB',				  '0x4000'],
                ['GUC_UNIT_MS',			     '0x10000'],
                ['GUC_UNIT_S',			     '0x20000'],
                ['GUC_UNIT_MIN',		     '0x30000'],
            ]),
            interval(11_00_00, 12_00_00, [
                ['GUC_LIST_INPUT',			  '0x0001'],
                ['GUC_LIST_QUOTE',			  '0x0002'],
                ['GUC_NO_SHOW_ALL',			  '0x0004'],
                ['GUC_NO_RESET_ALL',		  '0x0008'],
                ['GUC_REPORT',				  '0x0010'],
                ['GUC_NOT_IN_SAMPLE',		  '0x0020'],
                ['GUC_DISALLOW_IN_FILE',	  '0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	  '0x0080'],
                ['GUC_SUPERUSER_ONLY',		  '0x0100'],
                ['GUC_IS_NAME',				  '0x0200'],
                ['GUC_NOT_WHILE_SEC_REST',	  '0x0400'],
                ['GUC_DISALLOW_IN_AUTO_FILE', '0x0800'],
                ['GUC_UNIT_KB',				  '0x1000'],
                ['GUC_UNIT_BLOCKS',			  '0x2000'],
                ['GUC_UNIT_XBLOCKS',		  '0x3000'],
                ['GUC_UNIT_MB',				  '0x4000'],
                ['GUC_UNIT_BYTE',			  '0x8000'],
                ['GUC_UNIT_MS',			     '0x10000'],
                ['GUC_UNIT_S',			     '0x20000'],
                ['GUC_UNIT_MIN',		     '0x30000'],
            ]),
            interval(12_00_00, 15_00_00, [
                ['GUC_LIST_INPUT',			  '0x0001'],
                ['GUC_LIST_QUOTE',			  '0x0002'],
                ['GUC_NO_SHOW_ALL',			  '0x0004'],
                ['GUC_NO_RESET_ALL',		  '0x0008'],
                ['GUC_REPORT',				  '0x0010'],
                ['GUC_NOT_IN_SAMPLE',		  '0x0020'],
                ['GUC_DISALLOW_IN_FILE',	  '0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	  '0x0080'],
                ['GUC_SUPERUSER_ONLY',		  '0x0100'],
                ['GUC_IS_NAME',				  '0x0200'],
                ['GUC_NOT_WHILE_SEC_REST',	  '0x0400'],
                ['GUC_DISALLOW_IN_AUTO_FILE', '0x0800'],
                ['GUC_UNIT_KB',				  '0x1000'],
                ['GUC_UNIT_BLOCKS',			  '0x2000'],
                ['GUC_UNIT_XBLOCKS',		  '0x3000'],
                ['GUC_UNIT_MB',				  '0x4000'],
                ['GUC_UNIT_BYTE',			  '0x8000'],
                ['GUC_UNIT_MS',			     '0x10000'],
                ['GUC_UNIT_S',			     '0x20000'],
                ['GUC_UNIT_MIN',		     '0x30000'],
                ['GUC_EXPLAIN',			    '0x100000'],
                ['GUC_ALLOW_IN_PARALLEL',   '0x200000'],
            ]),
            interval(15_00_00, 16_00_00, [
                ['GUC_LIST_INPUT',			  '0x0001'],
                ['GUC_LIST_QUOTE',			  '0x0002'],
                ['GUC_NO_SHOW_ALL',			  '0x0004'],
                ['GUC_NO_RESET_ALL',		  '0x0008'],
                ['GUC_REPORT',				  '0x0010'],
                ['GUC_NOT_IN_SAMPLE',		  '0x0020'],
                ['GUC_DISALLOW_IN_FILE',	  '0x0040'],
                ['GUC_CUSTOM_PLACEHOLDER',	  '0x0080'],
                ['GUC_SUPERUSER_ONLY',		  '0x0100'],
                ['GUC_IS_NAME',				  '0x0200'],
                ['GUC_NOT_WHILE_SEC_REST',	  '0x0400'],
                ['GUC_DISALLOW_IN_AUTO_FILE', '0x0800'],
                ['GUC_UNIT_KB',				  '0x1000'],
                ['GUC_UNIT_BLOCKS',			  '0x2000'],
                ['GUC_UNIT_XBLOCKS',		  '0x3000'],
                ['GUC_UNIT_MB',				  '0x4000'],
                ['GUC_UNIT_BYTE',			  '0x8000'],
                ['GUC_UNIT_MS',			     '0x10000'],
                ['GUC_UNIT_S',			     '0x20000'],
                ['GUC_UNIT_MIN',		     '0x30000'],
                ['GUC_EXPLAIN',			    '0x100000'],
            ]),
            from(16_00_00, [
                ['GUC_LIST_INPUT',		      '0x000001'],
                ['GUC_LIST_QUOTE',		      '0x000002'],
                ['GUC_NO_SHOW_ALL',		      '0x000004'],
                ['GUC_NO_RESET',		      '0x000008'],
                ['GUC_NO_RESET_ALL',	      '0x000010'],
                ['GUC_EXPLAIN',			      '0x000020'],
                ['GUC_REPORT',			      '0x000040'],
                ['GUC_NOT_IN_SAMPLE',	      '0x000080'],
                ['GUC_DISALLOW_IN_FILE',      '0x000100'],
                ['GUC_CUSTOM_PLACEHOLDER',    '0x000200'],
                ['GUC_SUPERUSER_ONLY',	      '0x000400'],
                ['GUC_IS_NAME',			      '0x000800'],
                ['GUC_NOT_WHILE_SEC_REST',    '0x001000'],
                ['GUC_DISALLOW_IN_AUTO_FILE', '0x002000'],
                ['GUC_RUNTIME_COMPUTED',      '0x004000'],
                ['GUC_ALLOW_IN_PARALLEL',     '0x008000'],
                ['GUC_UNIT_KB',			    '0x01000000'],
                ['GUC_UNIT_BLOCKS',		    '0x02000000'],
                ['GUC_UNIT_XBLOCKS',	    '0x03000000'],
                ['GUC_UNIT_MB',			    '0x04000000'],
                ['GUC_UNIT_BYTE',		    '0x05000000'],
                ['GUC_UNIT_MS',			    '0x10000000'],
                ['GUC_UNIT_S',			    '0x20000000'],
                ['GUC_UNIT_MIN',		    '0x30000000'],
            ]),
        ]),

        /* src/include/storage/predicate_internals.h */
        _('SERIALIZABLEXACT', 'flags', [
            interval(9_01_00, 12_00_00, [
                ['SXACT_FLAG_COMMITTED', '0x00000001'],
                ['SXACT_FLAG_PREPARED', '0x00000002'],
                ['SXACT_FLAG_ROLLED_BACK', '0x00000004'],
                ['SXACT_FLAG_DOOMED', '0x00000008'],
                ['SXACT_FLAG_CONFLICT_OUT', '0x00000010'],
                ['SXACT_FLAG_READ_ONLY', '0x00000020'],
                ['SXACT_FLAG_DEFERRABLE_WAITING', '0x00000040'],
                ['SXACT_FLAG_RO_SAFE', '0x00000080'],
                ['SXACT_FLAG_RO_UNSAFE', '0x00000100'],
                ['SXACT_FLAG_SUMMARY_CONFLICT_IN', '0x00000200'],
                ['SXACT_FLAG_SUMMARY_CONFLICT_OUT', '0x00000400'],
            ]),
            from(12_00_00, [
                ['SXACT_FLAG_COMMITTED', '0x00000001'],
                ['SXACT_FLAG_PREPARED', '0x00000002'],
                ['SXACT_FLAG_ROLLED_BACK', '0x00000004'],
                ['SXACT_FLAG_DOOMED', '0x00000008'],
                ['SXACT_FLAG_CONFLICT_OUT', '0x00000010'],
                ['SXACT_FLAG_READ_ONLY', '0x00000020'],
                ['SXACT_FLAG_DEFERRABLE_WAITING', '0x00000040'],
                ['SXACT_FLAG_RO_SAFE', '0x00000080'],
                ['SXACT_FLAG_RO_UNSAFE', '0x00000100'],
                ['SXACT_FLAG_SUMMARY_CONFLICT_IN', '0x00000200'],
                ['SXACT_FLAG_SUMMARY_CONFLICT_OUT', '0x00000400'],
                ['SXACT_FLAG_PARTIALLY_RELEASED', '0x00000800'],
            ]),
        ]),

        /* src/include/storage/bufmgr.h */
        _('ReadBuffersOperation', 'flags', [
            interval(17_00_00, 18_00_00, [
                ['READ_BUFFERS_ZERO_ON_ERROR', '(1 << 0)'],
                ['READ_BUFFERS_ISSUE_ADVICE', '(1 << 1)'],
            ]),
            from(18_00_00, [
                ['READ_BUFFERS_ZERO_ON_ERROR', '(1 << 0)'],
                ['READ_BUFFERS_ISSUE_ADVICE', '(1 << 1)'],
                ['READ_BUFFERS_IGNORE_CHECKSUM_FAILURES', '(1 << 2)'],
                ['READ_BUFFERS_SYNCHRONOUSLY', '(1 << 3)'],
            ]),
        ]),

        /* src/include/tsearch/ts_public.h */
        _('TSLexeme', 'flags', [
            interval(8_02_00, 8_04_00, [
                ['TSL_ADDPOS', '0x01'],
            ]),
            interval(8_04_00, 9_00_00, [
                ['TSL_ADDPOS', '0x01'],
                ['TSL_PREFIX', '0x02'],
            ]),
            from(9_00_00, [
                ['TSL_ADDPOS', '0x01'],
                ['TSL_PREFIX', '0x02'],
                ['TSL_FILTER', '0x04'],
            ]),
        ]),

        /* src/backend/tsearch/wparser_def.c */
        _('TParserStateActionItem', 'flags', [
            from(8_02_00, [
                ['A_NEXT', '0x0000'],
                ['A_BINGO', '0x0001'],
                ['A_POP', '0x0002'],
                ['A_PUSH', '0x0004'],
                ['A_RERUN', '0x0008'],
                ['A_CLEAR', '0x0010'],
                ['A_MERGE', '0x0020'],
                ['A_CLRALL', '0x0040'],
            ]),
        ]),

        /* src/include/utils/expandedrecord.h */
        _('ExpandedRecordHeader', 'flags', [
            from(11_00_00, [
                ['ER_FLAG_FVALUE_VALID', '0x0001'],
                ['ER_FLAG_FVALUE_ALLOCED', '0x0002'],
                ['ER_FLAG_DVALUES_VALID', '0x0004'],
                ['ER_FLAG_DVALUES_ALLOCED', '0x0008'],
                ['ER_FLAG_HAVE_EXTERNAL', '0x0010'],
                ['ER_FLAG_TUPDESC_ALLOCED', '0x0020'],
                ['ER_FLAG_IS_DOMAIN', '0x0040'],
                ['ER_FLAG_IS_DUMMY', '0x0080'],
            ]),
        ]),

        /* src/backend/utils/adt/ruleutils.c */
        _('deparse_context', 'prettyFlags', [
            to(9_03_00, [
                ['PRETTYFLAG_PAREN', '1'],
                ['PRETTYFLAG_INDENT', '2'],
            ]),
            from(9_03_00, [
                ['PRETTYFLAG_PAREN', '0x0001'],
                ['PRETTYFLAG_INDENT', '0x0002'],
                ['PRETTYFLAG_SCHEMA', '0x0004'],
            ]),
        ]),

        /* src/include/utils/typcache.h */
        _('TypeCacheEntry', 'flags', [
            to(8_03_00, [
                ['TYPECACHE_EQ_OPR',			'0x0001'],
                ['TYPECACHE_LT_OPR',			'0x0002'],
                ['TYPECACHE_GT_OPR',			'0x0004'],
                ['TYPECACHE_CMP_PROC',			'0x0008'],
                ['TYPECACHE_EQ_OPR_FINFO',		'0x0010'],
                ['TYPECACHE_CMP_PROC_FINFO',	'0x0020'],
                ['TYPECACHE_TUPDESC',			'0x0040'],
            ]),
            interval(8_03_00, 9_01_00, [
                ['TYPECACHE_EQ_OPR',			'0x0001'],
                ['TYPECACHE_LT_OPR',			'0x0002'],
                ['TYPECACHE_GT_OPR',			'0x0004'],
                ['TYPECACHE_CMP_PROC',			'0x0008'],
                ['TYPECACHE_EQ_OPR_FINFO',		'0x0010'],
                ['TYPECACHE_CMP_PROC_FINFO',	'0x0020'],
                ['TYPECACHE_TUPDESC',			'0x0040'],
                ['TYPECACHE_BTREE_OPFAMILY',	'0x0080'],
            ]),
            interval(9_01_00, 9_02_00, [
                ['TYPECACHE_EQ_OPR',			'0x0001'],
                ['TYPECACHE_LT_OPR',			'0x0002'],
                ['TYPECACHE_GT_OPR',			'0x0004'],
                ['TYPECACHE_CMP_PROC',			'0x0008'],
                ['TYPECACHE_HASH_PROC',			'0x0010'],
                ['TYPECACHE_EQ_OPR_FINFO',		'0x0020'],
                ['TYPECACHE_CMP_PROC_FINFO',	'0x0040'],
                ['TYPECACHE_HASH_PROC_FINFO',	'0x0080'],
                ['TYPECACHE_TUPDESC',			'0x0100'],
                ['TYPECACHE_BTREE_OPFAMILY',	'0x0200'],
                ['TYPECACHE_HASH_OPFAMILY',		'0x0400'],
            ]),
            interval(9_02_00, 9_05_00, [
                ['TYPECACHE_EQ_OPR',			'0x0001'],
                ['TYPECACHE_LT_OPR',			'0x0002'],
                ['TYPECACHE_GT_OPR',			'0x0004'],
                ['TYPECACHE_CMP_PROC',			'0x0008'],
                ['TYPECACHE_HASH_PROC',			'0x0010'],
                ['TYPECACHE_EQ_OPR_FINFO',		'0x0020'],
                ['TYPECACHE_CMP_PROC_FINFO',	'0x0040'],
                ['TYPECACHE_HASH_PROC_FINFO',	'0x0080'],
                ['TYPECACHE_TUPDESC',			'0x0100'],
                ['TYPECACHE_BTREE_OPFAMILY',	'0x0200'],
                ['TYPECACHE_HASH_OPFAMILY',		'0x0400'],
                ['TYPECACHE_RANGE_INFO',		'0x0800'],
            ]),
            interval(9_05_00, 11_00_00, [
                ['TYPECACHE_EQ_OPR',			'0x0001'],
                ['TYPECACHE_LT_OPR',			'0x0002'],
                ['TYPECACHE_GT_OPR',			'0x0004'],
                ['TYPECACHE_CMP_PROC',			'0x0008'],
                ['TYPECACHE_HASH_PROC',			'0x0010'],
                ['TYPECACHE_EQ_OPR_FINFO',		'0x0020'],
                ['TYPECACHE_CMP_PROC_FINFO',	'0x0040'],
                ['TYPECACHE_HASH_PROC_FINFO',	'0x0080'],
                ['TYPECACHE_TUPDESC',			'0x0100'],
                ['TYPECACHE_BTREE_OPFAMILY',	'0x0200'],
                ['TYPECACHE_HASH_OPFAMILY',		'0x0400'],
                ['TYPECACHE_RANGE_INFO',		'0x0800'],
                ['TYPECACHE_DOMAIN_INFO',       '0x1000'],
            ]),
            interval(11_00_00, 14_00_00, [
                ['TYPECACHE_EQ_OPR',			'0x0001'],
                ['TYPECACHE_LT_OPR',			'0x0002'],
                ['TYPECACHE_GT_OPR',			'0x0004'],
                ['TYPECACHE_CMP_PROC',			'0x0008'],
                ['TYPECACHE_HASH_PROC',			'0x0010'],
                ['TYPECACHE_EQ_OPR_FINFO',		'0x0020'],
                ['TYPECACHE_CMP_PROC_FINFO',	'0x0040'],
                ['TYPECACHE_HASH_PROC_FINFO',	'0x0080'],
                ['TYPECACHE_TUPDESC',			'0x0100'],
                ['TYPECACHE_BTREE_OPFAMILY',	'0x0200'],
                ['TYPECACHE_HASH_OPFAMILY',		'0x0400'],
                ['TYPECACHE_RANGE_INFO',		'0x0800'],
                ['TYPECACHE_DOMAIN_BASE_INFO',			'0x1000'],
                ['TYPECACHE_DOMAIN_CONSTR_INFO',		'0x2000'],
                ['TYPECACHE_HASH_EXTENDED_PROC',		'0x4000'],
                ['TYPECACHE_HASH_EXTENDED_PROC_FINFO',	'0x8000'],
            ]),
            from(14_00_00, [
                ['TYPECACHE_EQ_OPR', '0x00001'],
                ['TYPECACHE_LT_OPR', '0x00002'],
                ['TYPECACHE_GT_OPR', '0x00004'],
                ['TYPECACHE_CMP_PROC', '0x00008'],
                ['TYPECACHE_HASH_PROC', '0x00010'],
                ['TYPECACHE_EQ_OPR_FINFO', '0x00020'],
                ['TYPECACHE_CMP_PROC_FINFO', '0x00040'],
                ['TYPECACHE_HASH_PROC_FINFO', '0x00080'],
                ['TYPECACHE_TUPDESC', '0x00100'],
                ['TYPECACHE_BTREE_OPFAMILY', '0x00200'],
                ['TYPECACHE_HASH_OPFAMILY', '0x00400'],
                ['TYPECACHE_RANGE_INFO', '0x00800'],
                ['TYPECACHE_DOMAIN_BASE_INFO', '0x01000'],
                ['TYPECACHE_DOMAIN_CONSTR_INFO', '0x02000'],
                ['TYPECACHE_HASH_EXTENDED_PROC', '0x04000'],
                ['TYPECACHE_HASH_EXTENDED_PROC_FINFO', '0x08000'],
                ['TYPECACHE_MULTIRANGE_INFO', '0x10000'],
            ]),
        ]),

        /* src/bin/pg_dump/pg_backup_archiver.h */
        _('_tocEntry', 'reqs', [
            from(14_00_00, [
                ['REQ_SCHEMA', '0x01'],
                ['REQ_DATA', '0x02'],
                ['REQ_SPECIAL', '0x04'],
            ]),
        ]),

        /* src/bin/pg_dump/pg_dump.h */
        ...[
            'dump',
            'dump_contains',
            'components',
        ].map(member => _('DumpableObject', member, [
            interval(9_06_00, 18_00_00, [
                ['DUMP_COMPONENT_NONE', '(0)'],
                ['DUMP_COMPONENT_DEFINITION', '(1 << 0)'],
                ['DUMP_COMPONENT_DATA', '(1 << 1)'],
                ['DUMP_COMPONENT_COMMENT', '(1 << 2)'],
                ['DUMP_COMPONENT_SECLABEL', '(1 << 3)'],
                ['DUMP_COMPONENT_ACL', '(1 << 4)'],
                ['DUMP_COMPONENT_POLICY', '(1 << 5)'],
                ['DUMP_COMPONENT_USERMAP', '(1 << 6)'],
                ['DUMP_COMPONENT_ALL', '(0xFFFF)'],
            ]),
            from(18_00_00, [
                ['DUMP_COMPONENT_NONE', '(0)'],
                ['DUMP_COMPONENT_DEFINITION', '(1 << 0)'],
                ['DUMP_COMPONENT_DATA', '(1 << 1)'],
                ['DUMP_COMPONENT_COMMENT', '(1 << 2)'],
                ['DUMP_COMPONENT_SECLABEL', '(1 << 3)'],
                ['DUMP_COMPONENT_ACL', '(1 << 4)'],
                ['DUMP_COMPONENT_POLICY', '(1 << 5)'],
                ['DUMP_COMPONENT_USERMAP', '(1 << 6)'],
                ['DUMP_COMPONENT_STATISTICS', '(1 << 7)'],
                ['DUMP_COMPONENT_ALL', '(0xFFFF)'],
            ]),
        ])),

        /* src/include/access/hash_xlog.h */
        _('xl_hash_split_allocate_page', 'flags', [
            from(10_00_00, [
                ['XLH_SPLIT_META_UPDATE_MASKS', '(1<<0)'],
                ['XLH_SPLIT_META_UPDATE_SPLITPOINT', '(1<<1)'],
            ]),
        ]),

        /* src/include/access/heapam_xlog.h */
        _('xl_heap_delete', 'flags', [
            interval(9_05_00, 11_00_00, [
                ['XLH_DELETE_ALL_VISIBLE_CLEARED', '(1<<0)'],
                ['XLH_DELETE_CONTAINS_OLD_TUPLE', '(1<<1)'],
                ['XLH_DELETE_CONTAINS_OLD_KEY', '(1<<2)'],
                ['XLH_DELETE_IS_SUPER', '(1<<3)'],
            ]),
            from(11_00_00, [
                ['XLH_DELETE_ALL_VISIBLE_CLEARED', '(1<<0)'],
                ['XLH_DELETE_CONTAINS_OLD_TUPLE', '(1<<1)'],
                ['XLH_DELETE_CONTAINS_OLD_KEY', '(1<<2)'],
                ['XLH_DELETE_IS_SUPER', '(1<<3)'],
                ['XLH_DELETE_IS_PARTITION_MOVE', '(1<<4)'],
            ]),
        ]),
        createInfobitsFlags('xl_heap_delete', 'infobits_set'),

        _('xl_heap_truncate', 'flags', [
            from(11_00_00, [
                ['XLH_TRUNCATE_CASCADE', '(1<<0)'],
                ['XLH_TRUNCATE_RESTART_SEQS', '(1<<1)'],
            ]),
        ]),

        createInfomaskFlags('xl_heap_header', 't_infomask'),
        createInfomask2Flags('xl_heap_header', 't_infomask2'),

        ...[
            'xl_heap_insert',
            'xl_heap_multi_insert',
        ].map(type => _(type, 'flags', [
            interval(9_05_00, 14_00_00, [
                ['XLH_INSERT_ALL_VISIBLE_CLEARED', '(1<<0)'],
                ['XLH_INSERT_LAST_IN_MULTI', '(1<<1)'],
                ['XLH_INSERT_IS_SPECULATIVE', '(1<<2)'],
                ['XLH_INSERT_CONTAINS_NEW_TUPLE', '(1<<3)'],
            ]),
            from(14_00_00, [
                ['XLH_INSERT_ALL_VISIBLE_CLEARED', '(1<<0)'],
                ['XLH_INSERT_LAST_IN_MULTI', '(1<<1)'],
                ['XLH_INSERT_IS_SPECULATIVE', '(1<<2)'],
                ['XLH_INSERT_CONTAINS_NEW_TUPLE', '(1<<3)'],
                ['XLH_INSERT_ON_TOAST_RELATION', '(1<<4)'],
                ['XLH_INSERT_ALL_FROZEN_SET', '(1<<5)'],
            ]),
        ])),

        createInfomaskFlags('xl_multi_insert_tuple', 't_infomask'),
        createInfomask2Flags('xl_multi_insert_tuple', 't_infomask2'),

        _('xl_heap_update', 'flags', [
            from(9_05_00, [
                ['XLH_UPDATE_OLD_ALL_VISIBLE_CLEARED', '(1<<0)'],
                ['XLH_UPDATE_NEW_ALL_VISIBLE_CLEARED', '(1<<1)'],
                ['XLH_UPDATE_CONTAINS_OLD_TUPLE', '(1<<2)'],
                ['XLH_UPDATE_CONTAINS_OLD_KEY', '(1<<3)'],
                ['XLH_UPDATE_CONTAINS_NEW_TUPLE', '(1<<4)'],
                ['XLH_UPDATE_PREFIX_FROM_OLD', '(1<<5)'],
                ['XLH_UPDATE_SUFFIX_FROM_OLD', '(1<<6)'],
            ]),
        ]),
        createInfobitsFlags('xl_heap_update', 'old_infobits_set'),

        _('xl_heap_prune', 'flags', [
            from(17_00_00, [
                ['XLHP_IS_CATALOG_REL', '(1 << 1)'],
                ['XLHP_CLEANUP_LOCK', '(1 << 2)'],
                ['XLHP_HAS_CONFLICT_HORIZON', '(1 << 3)'],
                ['XLHP_HAS_FREEZE_PLANS', '(1 << 4)'],
                ['XLHP_HAS_REDIRECTIONS', '(1 << 5)'],
                ['XLHP_HAS_DEAD_ITEMS', '(1 << 6)'],
                ['XLHP_HAS_NOW_UNUSED_ITEMS', '(1 << 7)'],
            ]),
        ]),

        ...[
            'xl_heap_lock',
            'xl_heap_lock_updated',
        ].map(type => _(type, 'flags', [
            from(9_05_00, [
                ['XLH_LOCK_ALL_FROZEN_CLEARED', '0x01'],
            ]),
        ])),

        createInfobitsFlags('xl_heap_lock', 'infobits_set'),

        _('xl_heap_visible', 'flags', [
            interval(9_05_00, 16_00_00, [
                ['VISIBILITYMAP_ALL_VISIBLE',	'0x01'],
                ['VISIBILITYMAP_ALL_FROZEN',	'0x02'],
                ['VISIBILITYMAP_VALID_BITS',	'0x03'],
            ]),
            from(16_00_00, [
                ['VISIBILITYMAP_ALL_VISIBLE', '0x01'],
                ['VISIBILITYMAP_ALL_FROZEN', '0x02'],
                ['VISIBILITYMAP_VALID_BITS', '0x03'],
                ['VISIBILITYMAP_XLOG_CATALOG_REL', '0x4'],
            ]),
        ]),

        /* src/include/access/xact.h */
        ...[
            'xl_xact_parsed_commit',
            'xl_xact_parsed_abort',
            'xl_xact_info',
        ].map(type => _(type, 'xinfo', [
            interval(9_05_00, 9_06_00, [
                ['XACT_XINFO_HAS_DBINFO', '(1U << 0)'],
                ['XACT_XINFO_HAS_SUBXACTS', '(1U << 1)'],
                ['XACT_XINFO_HAS_RELFILELOCATORS', '(1U << 2)'],
                ['XACT_XINFO_HAS_INVALS', '(1U << 3)'],
                ['XACT_XINFO_HAS_TWOPHASE', '(1U << 4)'],
                ['XACT_XINFO_HAS_ORIGIN', '(1U << 5)'],
                ['XACT_COMPLETION_UPDATE_RELCACHE_FILE', '(1U << 30)'],
                ['XACT_COMPLETION_FORCE_SYNC_COMMIT', '(1U << 31)'],
            ]),
            interval(9_06_00, 10_00_00, [
                ['XACT_XINFO_HAS_DBINFO', '(1U << 0)'],
                ['XACT_XINFO_HAS_SUBXACTS', '(1U << 1)'],
                ['XACT_XINFO_HAS_RELFILELOCATORS', '(1U << 2)'],
                ['XACT_XINFO_HAS_INVALS', '(1U << 3)'],
                ['XACT_XINFO_HAS_TWOPHASE', '(1U << 4)'],
                ['XACT_XINFO_HAS_ORIGIN', '(1U << 5)'],
                ['XACT_COMPLETION_APPLY_FEEDBACK', '(1U << 29)'],
                ['XACT_COMPLETION_UPDATE_RELCACHE_FILE', '(1U << 30)'],
                ['XACT_COMPLETION_FORCE_SYNC_COMMIT', '(1U << 31)'],
            ]),
            interval(10_00_00, 11_00_00, [
                ['XACT_XINFO_HAS_DBINFO', '(1U << 0)'],
                ['XACT_XINFO_HAS_SUBXACTS', '(1U << 1)'],
                ['XACT_XINFO_HAS_RELFILELOCATORS', '(1U << 2)'],
                ['XACT_XINFO_HAS_INVALS', '(1U << 3)'],
                ['XACT_XINFO_HAS_TWOPHASE', '(1U << 4)'],
                ['XACT_XINFO_HAS_ORIGIN', '(1U << 5)'],
                ['XACT_XINFO_HAS_AE_LOCKS', '(1U << 6)'],
                ['XACT_COMPLETION_APPLY_FEEDBACK', '(1U << 29)'],
                ['XACT_COMPLETION_UPDATE_RELCACHE_FILE', '(1U << 30)'],
                ['XACT_COMPLETION_FORCE_SYNC_COMMIT', '(1U << 31)'],
            ]),
            interval(11_00_00, 15_00_00, [
                ['XACT_XINFO_HAS_DBINFO', '(1U << 0)'],
                ['XACT_XINFO_HAS_SUBXACTS', '(1U << 1)'],
                ['XACT_XINFO_HAS_RELFILELOCATORS', '(1U << 2)'],
                ['XACT_XINFO_HAS_INVALS', '(1U << 3)'],
                ['XACT_XINFO_HAS_TWOPHASE', '(1U << 4)'],
                ['XACT_XINFO_HAS_ORIGIN', '(1U << 5)'],
                ['XACT_XINFO_HAS_AE_LOCKS', '(1U << 6)'],
                ['XACT_XINFO_HAS_GID', '(1U << 7)'],
                ['XACT_COMPLETION_APPLY_FEEDBACK', '(1U << 29)'],
                ['XACT_COMPLETION_UPDATE_RELCACHE_FILE', '(1U << 30)'],
                ['XACT_COMPLETION_FORCE_SYNC_COMMIT', '(1U << 31)'],
            ]),
            from(15_00_00, [
                ['XACT_XINFO_HAS_DBINFO', '(1U << 0)'],
                ['XACT_XINFO_HAS_SUBXACTS', '(1U << 1)'],
                ['XACT_XINFO_HAS_RELFILELOCATORS', '(1U << 2)'],
                ['XACT_XINFO_HAS_INVALS', '(1U << 3)'],
                ['XACT_XINFO_HAS_TWOPHASE', '(1U << 4)'],
                ['XACT_XINFO_HAS_ORIGIN', '(1U << 5)'],
                ['XACT_XINFO_HAS_AE_LOCKS', '(1U << 6)'],
                ['XACT_XINFO_HAS_GID', '(1U << 7)'],
                ['XACT_XINFO_HAS_DROPPED_STATS', '(1U << 8)'],
                ['XACT_COMPLETION_APPLY_FEEDBACK', '(1U << 29)'],
                ['XACT_COMPLETION_UPDATE_RELCACHE_FILE', '(1U << 30)'],
                ['XACT_COMPLETION_FORCE_SYNC_COMMIT', '(1U << 31)'],
            ]),
        ])),

        /* src/tsearch2/ispell/spell.h */
        ...[
            ['AFFIX', 'flagflags'],
            ['SPNodeData', 'compoundflag'],
        ].map(([type, member]) => _(type, member, [
            to(8_03_00, [
                ['FF_CROSSPRODUCT',			'0x01'],
                ['FF_COMPOUNDWORD',			'0x02'],
                ['FF_COMPOUNDONLYAFX',		'0x04'],
            ]),
            from(8_03_00, [
                ['FF_COMPOUNDONLY',			'0x01'],
                ['FF_COMPOUNDBEGIN',		'0x02'],
                ['FF_COMPOUNDMIDDLE',		'0x04'],
                ['FF_COMPOUNDLAST',			'0x08'],
                ['FF_COMPOUNDPERMITFLAG',	'0x10'],
                ['FF_COMPOUNDFORBIDFLAG',	'0x20'],
                ['FF_CROSSPRODUCT',			'0x40'],
            ]),
        ])),
    ];

    /* 
     * Each array of versions is stored in reversed order, because 1) it is
     * more likely that you are working with latest major version and 2) we
     * can get latest version of mask quiet fast (just take element at 0 index).
     */
    bitmasks.forEach(arr => arr.reverse());

    return bitmasks;
};

/* 
 * Most times you will work with same PostgreSQL version, so cache previous
 * flags for reuse.
 */
let prevVersionedFlagMembers: [BitmaskMemberInfo[], number] | undefined;
export function getWellKnownFlagsMembers(pgversion: number): BitmaskMemberInfo[] {
    /* Search in cache */
    if (prevVersionedFlagMembers !== undefined) {
        const [members, version] = prevVersionedFlagMembers;
        if (version === pgversion) {
            return members;
        }
    }

    const members = getVersionedFlagMembers()
        .map(arrs => arrs.find(([ver]) => ver.satisfies(pgversion))?.[1])
        .filter(x => x !== undefined);
    prevVersionedFlagMembers = [members, pgversion];
    return members;
}

const contribs = new Lazy(() => new Set<string>([
    'adminpack',
    'amcheck',
    'auth_delay',
    'auto_explain',
    'basebackup_to_shell',
    'basic_archive',
    'bloom',
    'bool_plperl',
    'btree_gin',
    'btree_gist',
    'chkpass',
    'citext',
    'cube',
    'dblink',
    'dict_int',
    'dict_xsyn',
    'earthdistance',
    'file_fdw',
    'fuzzystrmatch',
    'hstore',
    'hstore_plperl',
    'hstore_plpython',
    'intagg',
    'intarray',
    'isn',
    'jsonb_plperl',
    'jsonb_plpython',
    'lo',
    'ltree',
    'ltree_plpython',
    'oid2name',
    'old_snapshot',
    'pageinspect',
    'passwordcheck',
    'pg_buffercache',
    'pgcrypto',
    'pg_freespacemap',
    'pg_logicalinspect',
    'pg_overexplain',
    'pg_prewarm',
    'pgrowlocks',
    'pg_standby',
    'pg_stat_statements',
    'pgstattuple',
    'pg_surgery',
    'pg_trgm',
    'pg_visibility',
    'pg_walinspect',
    'postgres_fdw',
    'seg',
    'sepgsql',
    'spi',
    'sslinfo',
    'start-scripts',
    'tablefunc',
    'tcn',
    'test_decoding',
    'tsearch2',
    'tsm_system_rows',
    'tsm_system_time',
    'unaccent',
    'uuid-ossp',
    'vacuumlo',
    'xml2',
]));

export function getWellKnownBuiltinContribs() {
    return contribs.get();
}

export function getWellKnownConfigurationParameters() {    
    /* 
     * For core:
     *
     *   psql -c "select name from pg_settings where context <> 'internal' order by name" -t | awk "{print \"'\" \$1 \"',\" }" 
     * 
     * For contribs:
     * 
     *    grep -s -oE 'DefineCustom(Bool|Int|Enum|String|Real)Variable\("([a-zA-Z0-9\._]+)"' -R contrib | awk -F'"' "{print \"'\"  \$2 \"',\" }"
     * 
     * Some GUC are missing, i.e. ones that require special macros
     * to be defubed and with 'internal' context.
     * 
     * This one does not require to be cached, because it is also cached
     * during creation of 'vscode.CompletionItem[]' in pgconf.ts, so
     * avoid 2 layer caching
     */
    return [
        'allow_alter_system',
        'allow_in_place_tablespaces',
        'allow_system_table_mods',
        'application_name',
        'archive_cleanup_command',
        'archive_command',
        'archive_library',
        'archive_mode',
        'archive_timeout',
        'array_nulls',
        'auth_delay.milliseconds',
        'authentication_timeout',
        'auto_explain.log_analyze',
        'auto_explain.log_buffers',
        'auto_explain.log_format',
        'auto_explain.log_level',
        'auto_explain.log_min_duration',
        'auto_explain.log_nested_statements',
        'auto_explain.log_parameter_max_length',
        'auto_explain.log_settings',
        'auto_explain.log_timing',
        'auto_explain.log_triggers',
        'auto_explain.log_verbose',
        'auto_explain.log_wal',
        'auto_explain.sample_rate',
        'autovacuum',
        'autovacuum_analyze_scale_factor',
        'autovacuum_analyze_threshold',
        'autovacuum_freeze_max_age',
        'autovacuum_max_workers',
        'autovacuum_multixact_freeze_max_age',
        'autovacuum_naptime',
        'autovacuum_vacuum_cost_delay',
        'autovacuum_vacuum_cost_limit',
        'autovacuum_vacuum_insert_scale_factor',
        'autovacuum_vacuum_insert_threshold',
        'autovacuum_vacuum_max_threshold',
        'autovacuum_vacuum_scale_factor',
        'autovacuum_vacuum_threshold',
        'autovacuum_worker_slots',
        'autovacuum_work_mem',
        'backend_flush_after',
        'backslash_quote',
        'backtrace_functions',
        'basebackup_to_shell.command',
        'basebackup_to_shell.required_role',
        'basic_archive.archive_directory',
        'bgwriter_delay',
        'bgwriter_flush_after',
        'bgwriter_lru_maxpages',
        'bgwriter_lru_multiplier',
        'bonjour',
        'bonjour_name',
        'bytea_output',
        'check_function_bodies',
        'checkpoint_completion_target',
        'checkpoint_flush_after',
        'checkpoint_timeout',
        'checkpoint_warning',
        'client_connection_check_interval',
        'client_encoding',
        'client_min_messages',
        'cluster_name',
        'commit_delay',
        'commit_siblings',
        'commit_timestamp_buffers',
        'compute_query_id',
        'config_file',
        'constraint_exclusion',
        'cpu_index_tuple_cost',
        'cpu_operator_cost',
        'cpu_tuple_cost',
        'createrole_self_grant',
        'cursor_tuple_fraction',
        'data_directory',
        'data_sync_retry',
        'DateStyle',
        'db_user_namespace',
        'deadlock_timeout',
        'debug_copy_parse_plan_trees',
        'debug_discard_caches',
        'debug_io_direct',
        'debug_logical_replication_streaming',
        'debug_parallel_query',
        'debug_pretty_print',
        'debug_print_parse',
        'debug_print_plan',
        'debug_print_raw_parse',
        'debug_print_rewritten',
        'debug_raw_expression_coverage_test',
        'debug_write_read_parse_plan_trees',
        'default_statistics_target',
        'default_table_access_method',
        'default_tablespace',
        'default_text_search_config',
        'default_toast_compression',
        'default_transaction_deferrable',
        'default_transaction_isolation',
        'default_transaction_read_only',
        'default_with_oids',
        'dynamic_library_path',
        'dynamic_shared_memory_type',
        'effective_cache_size',
        'effective_io_concurrency',
        'enable_async_append',
        'enable_bitmapscan',
        'enable_distinct_reordering',
        'enable_gathermerge',
        'enable_group_by_reordering',
        'enable_hashagg',
        'enable_hashjoin',
        'enable_incremental_sort',
        'enable_indexonlyscan',
        'enable_indexscan',
        'enable_material',
        'enable_memoize',
        'enable_mergejoin',
        'enable_nestloop',
        'enable_parallel_append',
        'enable_parallel_hash',
        'enable_partition_pruning',
        'enable_partitionwise_aggregate',
        'enable_partitionwise_join',
        'enable_presorted_aggregate',
        'enable_self_join_elimination',
        'enable_seqscan',
        'enable_sort',
        'enable_tidscan',
        'escape_string_warning',
        'event_source',
        'event_triggers',
        'exit_on_error',
        'extension_control_path',
        'external_pid_file',
        'extra_float_digits',
        'file_copy_method',
        'force_parallel_mode',
        'from_collapse_limit',
        'fsync',
        'full_page_writes',
        'geqo',
        'geqo_effort',
        'geqo_generations',
        'geqo_pool_size',
        'geqo_seed',
        'geqo_selection_bias',
        'geqo_threshold',
        'gin_fuzzy_search_limit',
        'gin_pending_list_limit',
        'gss_accept_delegation',
        'hash_mem_multiplier',
        'hba_file',
        'hot_standby',
        'hot_standby_feedback',
        'huge_pages',
        'huge_page_size',
        'icu_validation_level',
        'ident_file',
        'idle_in_transaction_session_timeout',
        'idle_replication_slot_timeout',
        'idle_session_timeout',
        'ignore_checksum_failure',
        'ignore_invalid_pages',
        'ignore_system_indexes',
        'IntervalStyle',
        'io_combine_limit',
        'io_max_combine_limit',
        'io_max_concurrency',
        'io_method',
        'io_workers',
        'isn.weak',
        'jit',
        'jit_above_cost',
        'jit_debugging_support',
        'jit_dump_bitcode',
        'jit_expressions',
        'jit_inline_above_cost',
        'jit_optimize_above_cost',
        'jit_profiling_support',
        'jit_provider',
        'jit_tuple_deforming',
        'join_collapse_limit',
        'krb_caseins_users',
        'krb_server_keyfile',
        'lc_messages',
        'lc_monetary',
        'lc_numeric',
        'lc_time',
        'listen_addresses',
        'local_preload_libraries',
        'lock_timeout',
        'lo_compat_privileges',
        'log_autovacuum_min_duration',
        'log_checkpoints',
        'log_connections',
        'log_destination',
        'log_directory',
        'log_disconnections',
        'log_duration',
        'log_error_verbosity',
        'log_executor_stats',
        'log_file_mode',
        'log_filename',
        'logging_collector',
        'log_hostname',
        'logical_decoding_work_mem',
        'log_line_prefix',
        'log_lock_failures',
        'log_lock_waits',
        'log_min_duration_sample',
        'log_min_duration_statement',
        'log_min_error_statement',
        'log_min_messages',
        'log_parameter_max_length',
        'log_parameter_max_length_on_error',
        'log_parser_stats',
        'log_planner_stats',
        'log_recovery_conflict_waits',
        'log_replication_commands',
        'log_rotation_age',
        'log_rotation_size',
        'log_startup_progress_interval',
        'log_statement',
        'log_statement_sample_rate',
        'log_statement_stats',
        'log_temp_files',
        'log_timezone',
        'log_transaction_sample_rate',
        'log_truncate_on_rotation',
        'maintenance_io_concurrency',
        'maintenance_work_mem',
        'max_active_replication_origins',
        'max_connections',
        'max_files_per_process',
        'max_locks_per_transaction',
        'max_logical_replication_workers',
        'max_notify_queue_pages',
        'max_parallel_apply_workers_per_subscription',
        'max_parallel_maintenance_workers',
        'max_parallel_workers',
        'max_parallel_workers_per_gather',
        'max_pred_locks_per_page',
        'max_pred_locks_per_relation',
        'max_pred_locks_per_transaction',
        'max_prepared_transactions',
        'max_replication_slots',
        'max_slot_wal_keep_size',
        'max_stack_depth',
        'max_standby_archive_delay',
        'max_standby_streaming_delay',
        'max_sync_workers_per_subscription',
        'max_wal_senders',
        'max_wal_size',
        'max_worker_processes',
        'md5_password_warnings',
        'min_dynamic_shared_memory',
        'min_parallel_index_scan_size',
        'min_parallel_relation_size',
        'min_parallel_table_scan_size',
        'min_wal_size',
        'multixact_member_buffers',
        'multixact_offset_buffers',
        'notify_buffers',
        'oauth_validator_libraries',
        'old_snapshot_threshold',
        'operator_precedence_warning',
        'parallel_leader_participation',
        'parallel_setup_cost',
        'parallel_tuple_cost',
        'passwordcheck.min_password_length',
        'password_encryption',
        'pgcrypto.builtin_crypto_enabled',
        'pg_prewarm.autoprewarm',
        'pg_prewarm.autoprewarm_interval',
        'pg_stat_statements.max',
        'pg_stat_statements.save',
        'pg_stat_statements.track',
        'pg_stat_statements.track_planning',
        'pg_stat_statements.track_utility',
        'pg_trgm.similarity_threshold',
        'pg_trgm.strict_word_similarity_threshold',
        'pg_trgm.word_similarity_threshold',
        'plan_cache_mode',
        'port',
        'post_auth_delay',
        'postgres_fdw.application_name',
        'pre_auth_delay',
        'primary_conninfo',
        'primary_slot_name',
        'promote_trigger_file',
        'quote_all_identifiers',
        'random_page_cost',
        'recovery_end_command',
        'recovery_init_sync_method',
        'recovery_min_apply_delay',
        'recovery_prefetch',
        'recovery_target',
        'recovery_target_action',
        'recovery_target_inclusive',
        'recovery_target_lsn',
        'recovery_target_name',
        'recovery_target_time',
        'recovery_target_timeline',
        'recovery_target_xid',
        'recursive_worktable_factor',
        'remove_temp_files_after_crash',
        'replacement_sort_tuples',
        'reserved_connections',
        'restart_after_crash',
        'restore_command',
        'restrict_nonsystem_relation_kind',
        'row_security',
        'scram_iterations',
        'search_path',
        'send_abort_for_crash',
        'send_abort_for_kill',
        'sepgsql.debug_audit',
        'sepgsql.permissive',
        'seq_page_cost',
        'serializable_buffers',
        'session_preload_libraries',
        'session_replication_role',
        'shared_buffers',
        'shared_memory_type',
        'shared_preload_libraries',
        'sql_inheritance',
        'ssl',
        'ssl_ca_file',
        'ssl_cert_file',
        'ssl_ciphers',
        'ssl_crl_dir',
        'ssl_crl_file',
        'ssl_dh_params_file',
        'ssl_ecdh_curve',
        'ssl_groups',
        'ssl_key_file',
        'ssl_max_protocol_version',
        'ssl_min_protocol_version',
        'ssl_passphrase_command',
        'ssl_passphrase_command_supports_reload',
        'ssl_prefer_server_ciphers',
        'ssl_tls13_ciphers',
        'standard_conforming_strings',
        'statement_timeout',
        'stats_fetch_consistency',
        'stats_temp_directory',
        'subtransaction_buffers',
        'summarize_wal',
        'superuser_reserved_connections',
        'synchronized_standby_slots',
        'synchronize_seqscans',
        'synchronous_commit',
        'synchronous_standby_names',
        'sync_replication_slots',
        'syslog_facility',
        'syslog_ident',
        'syslog_sequence_numbers',
        'syslog_split_messages',
        'tcp_keepalives_count',
        'tcp_keepalives_idle',
        'tcp_keepalives_interval',
        'tcp_user_timeout',
        'temp_buffers',
        'temp_file_limit',
        'temp_tablespaces',
        'TimeZone',
        'timezone_abbreviations',
        'trace_connection_negotiation',
        'trace_notify',
        'trace_recovery_messages',
        'trace_sort',
        'track_activities',
        'track_activity_query_size',
        'track_commit_timestamp',
        'track_cost_delay_timing',
        'track_counts',
        'track_functions',
        'track_io_timing',
        'track_wal_io_timing',
        'transaction_buffers',
        'transaction_deferrable',
        'transaction_isolation',
        'transaction_read_only',
        'transaction_timeout',
        'transform_null_equals',
        'unix_socket_directories',
        'unix_socket_group',
        'unix_socket_permissions',
        'update_process_title',
        'vacuum_buffer_usage_limit',
        'vacuum_cleanup_index_scale_factor',
        'vacuum_cost_delay',
        'vacuum_cost_limit',
        'vacuum_cost_page_dirty',
        'vacuum_cost_page_hit',
        'vacuum_cost_page_miss',
        'vacuum_defer_cleanup_age',
        'vacuum_failsafe_age',
        'vacuum_freeze_min_age',
        'vacuum_freeze_table_age',
        'vacuum_max_eager_freeze_failure_rate',
        'vacuum_multixact_failsafe_age',
        'vacuum_multixact_freeze_min_age',
        'vacuum_multixact_freeze_table_age',
        'vacuum_truncate',
        'wal_buffers',
        'wal_compression',
        'wal_consistency_checking',
        'wal_decode_buffer_size',
        'wal_init_zero',
        'wal_keep_segments',
        'wal_keep_size',
        'wal_level',
        'wal_log_hints',
        'wal_receiver_create_temp_slot',
        'wal_receiver_status_interval',
        'wal_receiver_timeout',
        'wal_recycle',
        'wal_retrieve_retry_interval',
        'wal_sender_timeout',
        'wal_skip_threshold',
        'wal_summary_keep_time',
        'wal_sync_method',
        'wal_writer_delay',
        'wal_writer_flush_after',
        'work_mem',
        'xmlbinary',
        'xmloption',
        'zero_damaged_pages',
    ];
}
