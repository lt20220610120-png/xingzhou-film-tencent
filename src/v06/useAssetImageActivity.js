import {useSyncExternalStore} from 'react';
import {assetImageActivity} from '../../core/assetImageActivity.js';
export function useAssetImageActivity(projectId,accountId){
 const activity=assetImageActivity(projectId,accountId);
 const {ids,batches}=useSyncExternalStore(activity.subscribe,activity.snapshot);
 return [ids,activity.setIds,activity.idsRef,activity,batches];
}
