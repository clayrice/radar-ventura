import 'server-only';
import {MEDIA_BUCKET,type PartnerMedia} from './partner-media';
import {publicDb} from './db';
export function showcaseItems(items:Omit<PartnerMedia,'url'>[],updatedAt:string):PartnerMedia[]{
 const db=publicDb();return items.map(item=>({...item,url:db.storage.from(MEDIA_BUCKET).getPublicUrl(item.path).data.publicUrl+`?v=${encodeURIComponent(updatedAt)}`}));
}
