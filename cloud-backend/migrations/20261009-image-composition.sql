alter table collab_projects add column if not exists image_composition text not null default 'portrait-four' check(image_composition in ('portrait-four','portrait-five'));
