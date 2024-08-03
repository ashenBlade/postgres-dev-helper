import { IVariable } from "./extension";
import * as utils from "./utils";
import * as dap from "./dap";
import { isStringObject } from "util/types";

/**
 * Class wrapper to check that member has special meaning and must 
 * be treated in a special way.
 */
export abstract class SpecialMember {
    protected readonly logger: utils.ILogger;

    /**
     * Tag of type, that this member belongs.
     * Stored without 'T_' prefix.
     * Used as key for Map.
     */

    nodeTag: string;
    /**
     * Name of member with which we work
     */
    memberName: string;

    constructor(parentTag: string, memberName: string, logger: utils.ILogger) {
        this.nodeTag = parentTag.replace('T_', '');
        this.memberName = memberName;
        this.logger = logger;
    }

    /**
     * Check that variable must be treated in special way.
     * 
     * @param variable Variable to test
     */
    isSpecialMember(variable: IVariable): boolean {
        return variable.parent?.nodeTag === this.nodeTag && variable.name === this.memberName;
    }

    /**
     * Check that variable can have subvariables in view.
     * This is true for structs or arrays.
     * 
     * @param variable Variable to test
     */
    abstract isExpandable(variable: IVariable): boolean;

    /**
     * Process special variable and make necessary changes/evaluations.
     * This is main method to manipulate members.
     * This is called inside {@link NodePreviewTreeViewProvider.getChildren getChildren} to get
     * members of struct.
     * 
     * @param member Variable to test
     * @param debug Interface to debugger
     * @returns Pair of result variable (may be the one that was passed) and array subvariables for this variable (if undefined - obtain as usual by evaluating) 
     * or undefined if no changes performed
     */
    abstract visitMember(member: IVariable, debug: utils.IDebuggerFacade): Promise<[IVariable, dap.DebugVariable[] | undefined] | null>;
}

export class ListSpecialMember extends SpecialMember {
    constructor(logger: utils.ILogger) {
        super('List', 'elements', logger);
    }

    isExpandable(_: IVariable): boolean {
        return true;
    }

    async visitMember(variable: IVariable, debug: utils.IDebuggerFacade): Promise<[IVariable, dap.DebugVariable[] | undefined] | null> {
        /* 
         * Most `List`s are of Node type, so small performance optimization - 
         * treat `elements` as Node* array (pointer has compatible size).
         * Later we can observe each independently, but not now.
         */
        if (!variable.parent) {
            return null;
        }

        const listLength = Number((await debug.evaluate(`(${variable.parent.evaluateName})->length`, variable.parent.frameId)).result);
        if (Number.isNaN(listLength)) {
            this.logger.warn(`fail to obtain list size for ${variable.parent.name}`);
            return null;
        }

        const expression = `(Node **)(${variable.evaluateName}), ${listLength}`;
        const response = await debug.evaluate(expression, variable.frameId);
        variable = {
            ...variable,
            type: 'Node **',
            declaredType: variable.type,
            evaluateName: expression,
            variablesReference: response.variablesReference,
        } as IVariable;
        return [variable, undefined];
    }
}

export class IntOidListSpecialMember extends SpecialMember {
    private readonly fieldName: string;
    private readonly realType: string;

    private constructor(tag: string, fieldName: string, realType: string, logger: utils.ILogger) {
        super(tag, 'elements', logger);
        this.fieldName = fieldName;
        this.realType = realType;
    }

    isExpandable(variable: IVariable): boolean {
        return true;
    }

    async visitMember(variable: IVariable, debug: utils.IDebuggerFacade): Promise<[IVariable, dap.DebugVariable[] | undefined] | null> {
        if (variable.parent === undefined) {
            return null;
        }

        const listLength = Number((await debug.evaluate(`(${variable.parent.evaluateName})->length`, variable.parent.frameId)).result);
        if (Number.isNaN(listLength)) {
            this.logger.warn(`fail to obtain list size for ${variable.parent.name}`);
            return null;
        }

        /* 
         * We can not just cast `elements' to int* or Oid* 
         * due to padding in `union'. For these we iterate 
         * each element and evaluate each item independently
         */
        const arrayElements: dap.DebugVariable[] = [];
        for (let i = 0; i < listLength; i++) {
            const expression = `(${variable.evaluateName})[${i}].${this.fieldName}`;
            const response = await debug.evaluate(expression, variable.frameId);
            arrayElements.push({
                name: `[${i}]`,
                type: this.realType,
                evaluateName: expression,
                variablesReference: response.variablesReference,
                value: response.result,
                memoryReference: response.memoryReference,
            });
        }

        return [variable, arrayElements];
    }

    static createIntList = (logger: utils.ILogger) => new IntOidListSpecialMember('IntList', 'int_value', 'int', logger);
    static createOidList = (logger: utils.ILogger) => new IntOidListSpecialMember('OidList', 'oid_value', 'Oid', logger);
}

export class ArraySpecialMember extends SpecialMember {
    /**
     * Field of parent that we use to obtain array length
     */
    private readonly lengthField: string;

    constructor(nodeTag: string, memberName: string, lengthField: string, logger: utils.ILogger) {
        super(nodeTag, memberName, logger);
        this.lengthField = lengthField;
    }

    isSpecialMember(variable: IVariable): boolean {
        return super.isSpecialMember(variable) && variable.parent !== undefined;
    }

    isExpandable(_: IVariable): boolean {
        /* 
         * All arrays will be marked as expandable.
         * Whether we can or not is up to us to decide later.
         */
        return true;
    }

    async visitMember(variable: IVariable, debug: utils.IDebuggerFacade): Promise<[IVariable, dap.DebugVariable[] | undefined] | null> {
        if (variable.parent === undefined) {
            return null;
        }

        const lengthExpression = `(${variable.parent.evaluateName})->${this.lengthField}`;
        const arrayLength = Number((await debug.evaluate(lengthExpression, variable.parent.frameId)).result);
        if (Number.isNaN(arrayLength)) {
            this.logger.warn(`fail to obtain array size for ${variable.parent.name}->${this.lengthField}`);
            return [variable, undefined];
        }

        if (arrayLength === 0) {
            return null;
        }

        const response = await debug.evaluate(`${variable.evaluateName}, ${arrayLength}`, variable.frameId);
        variable = {
            ...variable,
            variablesReference: response.variablesReference,
        };
        return [variable, undefined];
    }
}

export function getWellKnownSpecialMembers(log: utils.ILogger): SpecialMember[] {
    return [
        /* List->elements */
        new ListSpecialMember(log),
        /* IntList->elements */
        IntOidListSpecialMember.createIntList(log),
        /* OidList->elements */
        IntOidListSpecialMember.createIntList(log),
        /* PlannerInfo->simple_rel_array */
        new ArraySpecialMember('PlannerInfo', 'simple_rel_array', 'simple_rel_array_size', log),
        /* PlannerInfo->simple_rte_array */
        new ArraySpecialMember('PlannerInfo', 'simple_rte_array', 'simple_rel_array_size', log),
    ];
}

/**
 * Create {@link SpecialMember SpecialMember} object with required type
 * from parsed JSON object in settings file.
 * If there is error occured (i.e. invalid configuration) - it will throw 
 * exception with message describing error.
 * 
 * @param object parsed JSON object of special member from setting file
 */
export function createSpecialMember(object: any, log: utils.ILogger): SpecialMember {
    if (object.type !== 'array') {
        throw new Error('only array members supported yet');
    }

    let nodeTag = object.nodeTag;
    if (!nodeTag) {
        throw new Error("nodeTag field not provided");
    }

    if (typeof nodeTag !== 'string') {
        throw new Error(`nodeTag type must be string, given: ${typeof nodeTag}`);
    }
    nodeTag = nodeTag.trim().replace('T_', '');
    if (!nodeTag) {
        throw new Error(`nodeTag field must contain valid NodeTag. given: ${object.nodeTag}`);
    }

    /* NodeTag used also as type name, so it must be valid identifier */
    if (!utils.isValidIdentifier(nodeTag)) {
        throw new Error(`nodeTag must be valid identifier. given: ${object.nodeTag}`);
    }

    let memberName = object.memberName;
    if (!memberName) {
        throw new Error(`memberName field not provided for type with NodeTag: ${object.nodeTag}`);
    }
    
    if (typeof memberName !== 'string') {
        throw new Error(`memberName field must be string for type with NodeTag: ${object.nodeTag}`);
    }

    memberName = memberName.trim();
    if (!utils.isValidIdentifier(memberName)) {
        throw new Error(`memberName field ${memberName} is not valid identifier - contains invalid characters`)
    }
    
    let lengthMemberName = object.lengthMemberName;
    if (!lengthMemberName) {
        throw new Error(`lengthMemberName not provided for: ${object.nodeTag}->${memberName}`);
    }

    if (typeof lengthMemberName !== 'string') {
        throw new Error(`lengthMemberName field must be string for: ${object.nodeTag}->${memberName}`);
    }
    
    lengthMemberName = lengthMemberName.trim();
    if (!utils.isValidIdentifier(lengthMemberName)) {
        throw new Error(`lengthMemberName field ${lengthMemberName} must be valid identifier: ${object.nodeTag}->${memberName}`);
    }
    
    return new ArraySpecialMember(nodeTag, memberName, lengthMemberName, log);
}