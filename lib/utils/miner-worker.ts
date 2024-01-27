/**
This file was created by the user:
https://github.com/danieleth2/atomicals-js/commit/02e854cc71c0f6c6559ff35c2093dc8d526b5d72
*/
import { parentPort } from "worker_threads";
import { KeyPairInfo, getKeypairInfo } from "./address-keypair-path";
import { script, payments } from "bitcoinjs-lib";
import { BitworkInfo, hasValidBitwork } from "./atomical-format-helpers";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from "ecpair";

const tinysecp: TinySecp256k1Interface = require("tiny-secp256k1");
const bitcoin = require("bitcoinjs-lib");
import * as chalk from "chalk";

bitcoin.initEccLib(ecc);
import { initEccLib, networks, Psbt } from "bitcoinjs-lib";

initEccLib(tinysecp as any);
import {
    AtomicalsPayload,
    NETWORK,
    RBF_INPUT_SEQUENCE,
} from "../commands/command-helpers";
import {
    AtomicalOperationBuilderOptions,
    DUST_AMOUNT,
    EXCESSIVE_FEE_LIMIT,
    FeeCalculations,
    OUTPUT_BYTES_BASE,
} from "./atomical-operation-builder";
import { Worker } from "worker_threads";
import { ATOMICALS_PROTOCOL_ENVELOPE_ID } from "../types/protocol-tags";
import { chunkBuffer } from "./file-utils";

const ECPair: ECPairAPI = ECPairFactory(tinysecp);

interface WorkerInput {
    copiedData: AtomicalsPayload;
    nonceStart: any;
    nonceEnd: any;
    timeStart: number;
    timeDelta: number;
    revealAddress: string;
    workerOptions: AtomicalOperationBuilderOptions;
    fundingWIF: string;
    fundingUtxo: any;
    fees: FeeCalculations;
    performBitworkForCommitTx: boolean;
    workerBitworkInfoCommit: BitworkInfo;
    iscriptP2TR: any;
    ihashLockP2TR: any;
    workerId?: string;
}

// This is the worker's message event listener
if (parentPort) {
    parentPort.on("message", async (message: WorkerInput) => {
        // Destructuring relevant data from the message object
        const {
            copiedData,
            nonceStart,
            nonceEnd,
            timeStart,
            timeDelta,
            revealAddress,
            workerOptions,
            fundingWIF,
            fundingUtxo,
            fees,
            performBitworkForCommitTx,
            workerBitworkInfoCommit,
            iscriptP2TR,
            ihashLockP2TR,
            workerId,
        } = message;

        // Initialize worker-specific variables
        let workerNonce = nonceStart - 1;
        let workerNoncesGenerated = 0;
        let workerPerformBitworkForCommitTx = performBitworkForCommitTx;
        let scriptP2TR = iscriptP2TR;
        let hashLockP2TR = ihashLockP2TR;

        // Convert the WIF (Wallet Import Format) to a keypair
        const fundingKeypairRaw = ECPair.fromWIF(fundingWIF);
        const fundingKeypair = getKeypairInfo(fundingKeypairRaw);

        // Variables to hold final results
        let finalCopyData;
        let finalPrelimTx;
        let finalBaseCommit;

        // Record current Unix time
        let unixtime = timeStart
        copiedData["args"]["time"] = unixtime;
        let lastLogTime = 0;

        // Start mining loop, terminates when a valid proof of work is found or stopped manually
        do {
            // Introduce a minor delay to avoid overloading the CPU
            // await sleep(0); // Changed from 1 second for a non-blocking wait // Removed, see https://github.com/atomicals/atomicals-js/pull/257

            // Set nonce and timestamp in the data to be committed
            if (workerNonce >= nonceEnd) {
                unixtime -= timeDelta;
                copiedData["args"]["time"] = unixtime;
                workerNonce = nonceStart;
            } else {
                workerNonce++;
            }
            copiedData["args"]["nonce"] = workerNonce;

            // Create a new atomic payload instance
            const atomPayload = new AtomicalsPayload(copiedData);

            // Prepare commit and reveal configurations
            const updatedBaseCommit: { scriptP2TR } =
                workerPrepareCommitRevealConfig(
                    workerOptions.opType,
                    fundingKeypair,
                    atomPayload
                );
            if (workerNoncesGenerated % 10000 === 0) {
                const now = Date.now();
                const speed = lastLogTime > 0 ? Math.round(10000 / (now - lastLogTime) * 1000) : '-';
                lastLogTime = now;
                const nonce = nonceStart === nonceEnd ? workerNonce : workerNonce.toString().padStart(7, ' ')
                console.log(
                    `${(new Date()).toLocaleString()}  Worker #${workerId}: ${workerNoncesGenerated} params checked, current nonce: ${nonce}, time: ${unixtime}, current worker speed: ${speed}`
                );
                await sleep(0);
            }
            // Check if there is a valid proof of work
            if (updatedBaseCommit.scriptP2TR.address === revealAddress) {
                // Valid proof of work found, log success message

                console.log(
                    chalk.green('Target address matched!')
                );

                // Set final results

                finalCopyData = copiedData;
                finalBaseCommit = updatedBaseCommit;
                workerPerformBitworkForCommitTx = false;
            }

            workerNoncesGenerated++;
        } while (workerPerformBitworkForCommitTx);

        // send a result or message back to the main thread
        // console.log("got one finalCopyData:" + JSON.stringify(finalCopyData));
        // console.log("got one finalPrelimTx:" + JSON.stringify(finalPrelimTx));
        parentPort!.postMessage({
            finalCopyData,
            finalPrelimTx,
            finalBaseCommit,
        });
    });
}

function getOutputValueForCommit(fees: FeeCalculations): number {
    let sum = 0;
    // Note that `Additional inputs` refers to the additional inputs in a reveal tx.
    return fees.revealFeePlusOutputs - sum;
}

function addCommitChangeOutputIfRequired(
    extraInputValue: number,
    fee: FeeCalculations,
    pbst: any,
    address: string,
    satsbyte: any
) {
    const totalInputsValue = extraInputValue;
    const totalOutputsValue = getOutputValueForCommit(fee);
    const calculatedFee = totalInputsValue - totalOutputsValue;
    // It will be invalid, but at least we know we don't need to add change
    if (calculatedFee <= 0) {
        return;
    }
    // In order to keep the fee-rate unchanged, we should add extra fee for the new added change output.
    const expectedFee =
        fee.commitFeeOnly + (satsbyte as any) * OUTPUT_BYTES_BASE;
    // console.log('expectedFee', expectedFee);
    const differenceBetweenCalculatedAndExpected = calculatedFee - expectedFee;
    if (differenceBetweenCalculatedAndExpected <= 0) {
        return;
    }
    // There were some excess satoshis, but let's verify that it meets the dust threshold to make change
    if (differenceBetweenCalculatedAndExpected >= DUST_AMOUNT) {
        pbst.addOutput({
            address: address,
            value: differenceBetweenCalculatedAndExpected,
        });
    }
}

export const workerPrepareCommitRevealConfig = (
    opType:
        | "nft"
        | "ft"
        | "dft"
        | "dmt"
        | "sl"
        | "x"
        | "y"
        | "mod"
        | "evt"
        | "dat",
    keypair: KeyPairInfo,
    atomicalsPayload: AtomicalsPayload,
    log = true
) => {
    const revealScript = appendMintUpdateRevealScript(
        opType,
        keypair,
        atomicalsPayload,
        log
    );
    const hashscript = script.fromASM(revealScript);
    const scriptTree = {
        output: hashscript,
    };
    const buffer = Buffer.from(keypair.childNodeXOnlyPubkey);
    const scriptP2TR = payments.p2tr({
        internalPubkey: buffer,
        scriptTree,
        network: NETWORK,
    });
    return {
        scriptP2TR,
    };
};

export const appendMintUpdateRevealScript = (
    opType:
        | "nft"
        | "ft"
        | "dft"
        | "dmt"
        | "sl"
        | "x"
        | "y"
        | "mod"
        | "evt"
        | "dat",
    keypair: KeyPairInfo,
    payload: AtomicalsPayload,
    log: boolean = true
) => {
    let ops = `${Buffer.from(keypair.childNodeXOnlyPubkey, "utf8").toString(
        "hex"
    )} OP_CHECKSIG OP_0 OP_IF `;
    ops += `${Buffer.from(ATOMICALS_PROTOCOL_ENVELOPE_ID, "utf8").toString(
        "hex"
    )}`;
    ops += ` ${Buffer.from(opType, "utf8").toString("hex")}`;
    const chunks = chunkBuffer(payload.cbor(), 520);
    for (let chunk of chunks) {
        ops += ` ${chunk.toString("hex")}`;
    }
    ops += ` OP_ENDIF`;
    return ops;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
