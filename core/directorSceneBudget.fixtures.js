export const manorScene = `场景 2-1 白家玫瑰庄园客厅 日 内景
人物：Elena Suh、Claudia Oh、Mia Oh、Sebastian Paik、家庭医生、管家
△接上集同一场戏，人物位置与时间连续。
△红酒在地毯上洇开深色痕迹，水晶瓶滚在桌边。
△Mia Oh（捂着脸哭）。
Mia Oh：妈！她敢泼我！
Mia Oh: Mom! She poured wine all over me!
△Mia Oh转身跑上楼
△Claudia Oh（脸色铁青）。
Claudia Oh：把她给我赶出去！现在就赶！
Claudia Oh: Throw her out! Right now!
△管家上前半步又停住
△家庭医生提着药箱从门口进来
家庭医生：夫人，不能赶。
Family Doctor: I'm afraid you can't, ma'am.
家庭医生：老会长昏迷前特意交代，Elena必须留在白家，好好安置。
Family Doctor: Before he fell into a coma, the chairman specifically asked that Elena stay with the family and be properly looked after.
△Claudia Oh（咬牙）。
Claudia Oh：……好，我倒要看看她能撑几天。
Claudia Oh: Fine. Let's see how long she lasts.
△Elena Suh站在原地，抬手擦去袖口酒渍
△Sebastian Paik抱臂站在门边，目光落在Elena脸上
Sebastian Paik：这女孩，不像普通乡下孩子。
Sebastian Paik (V.O.): There's more to her than a girl from the country.`;

export const englishManorScene = manorScene.split('\n').filter(line => !/^(?:Mia Oh|Claudia Oh|家庭医生|Sebastian Paik)：/u.test(line)).join('\n');
