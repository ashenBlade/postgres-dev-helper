#include "postgres.h"
#include "fmgr.h"
#include "utils/builtins.h"
#include "nodes/primnodes.h"
#include "nodes/nodeFuncs.h"
#include "nodes/pathnodes.h"
#include "parser/parsetree.h"
#include "utils/lsyscache.h"

#ifdef PG_MODULE_MAGIC
PG_MODULE_MAGIC;
#endif

PGDLLEXPORT char *pg_hacker_helper_format_expr(const Expr *expr, const List *rtable);
PGDLLEXPORT int pg_hacker_helper_version();
static void format_expr_inner(StringInfo str, const Expr *expr, const List *rtable);

static void format_expr_inner(StringInfo str, const Expr *expr, const List *rtable)
{
	/* Copied from src/backend/nodes/print.c:print_expr */
	if (IsA(expr, Var))
	{
		const Var  *var = (const Var *) expr;
		char	   *relname,
				   *attname;

		switch (var->varno)
		{
			case INNER_VAR:
				relname = "INNER";
				attname = "?";
				break;
			case OUTER_VAR:
				relname = "OUTER";
				attname = "?";
				break;
			case INDEX_VAR:
				relname = "INDEX";
				attname = "?";
				break;
			default:
				{
					RangeTblEntry *rte;
					
					/* There was Assert */
					if (!(var->varno > 0 && (int) var->varno <= list_length(rtable)))
						return;

					rte = rt_fetch(var->varno, rtable);
					relname = rte->eref->aliasname;
					attname = get_rte_attribute_name(rte, var->varattno);
				}
				break;
		}
		appendStringInfo(str, "%s.%s", relname, attname);
	}
	else if (IsA(expr, Const))
	{
		const Const *c = (const Const *) expr;
		Oid			typoutput;
		bool		typIsVarlena;
		char	   *outputstr;

		if (c->constisnull)
		{
			appendStringInfo(str, "NULL");
			return;
		}

		getTypeOutputInfo(c->consttype,
						  &typoutput, &typIsVarlena);

		outputstr = OidOutputFunctionCall(typoutput, c->constvalue);
		appendStringInfo(str, "%s", outputstr);
		pfree(outputstr);
	}
	else if (IsA(expr, OpExpr))
	{
		const OpExpr *e = (const OpExpr *) expr;
		char	   *opname;

		opname = get_opname(e->opno);
		if (list_length(e->args) > 1)
		{
			format_expr_inner(str, (Expr *) get_leftop((const Expr *) e), rtable);
			appendStringInfo(str, " %s ", ((opname != NULL) ? opname : "(invalid operator)"));
			format_expr_inner(str, (Expr *) get_rightop((const Expr *) e), rtable);
		}
		else
		{
			appendStringInfo(str, "%s ", ((opname != NULL) ? opname : "(invalid operator)"));
			format_expr_inner(str, (Expr *) get_leftop((const Expr *) e), rtable);
		}
	}
	else if (IsA(expr, FuncExpr))
	{
		const FuncExpr *e = (const FuncExpr *) expr;
		char	   *funcname;
		ListCell   *l;

		funcname = get_func_name(e->funcid);
		appendStringInfo(str, "%s(", ((funcname != NULL) ? funcname : "(invalid function)"));
		foreach(l, e->args)
		{
			format_expr_inner(str, (Expr *)lfirst(l), rtable);
			if (lnext(e->args, l))
				appendStringInfoChar(str, ',');
		}
		appendStringInfoChar(str, ')');
	}
	else
		appendStringInfo(str, "unknown expr");
}

char *
pg_hacker_helper_format_expr(const Expr *expr, const List *rtable)
{
	StringInfoData str;

	if (expr == NULL)
	{
		return NULL;
	}

	initStringInfo(&str);

	format_expr_inner(&str, expr, rtable);
	
	return str.data;
}

int
pg_hacker_helper_version()
{
	return 1;
}

void
_PG_init(void)
{
	elog(WARNING, "PG Hacker Helper tools extension is used! "
				  "It must be used only during development!");
}
